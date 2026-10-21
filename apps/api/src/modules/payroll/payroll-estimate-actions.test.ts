import { it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { uploadFixture } from './payroll-upload.fixture'
import { statement } from './payroll.fixture'
import { hours } from '../../../../../packages/shared/src/payroll.fixture'
import { testRequest, testUser } from '../../testing/workspace'
it.each([false, true])(
  'edits and deletes estimates atomically, preserves snapshots, protects documents and persists cancellation encrypted=%s',
  async (encrypted) => {
    const f = await uploadFixture(encrypted)
    const body = {
      values: { ...hours, sourceId: f.source.id },
      idempotencyKey: randomUUID(),
      submit: false,
      revision: 0,
      reason: 'Synthetic draft',
    }
    const draft = await f.ok('POST', '/income/payroll/weeks', body)
    const edited = await f.ok('PATCH', `/income/payroll/weeks/${draft.id}`, {
      ...body,
      values: { ...body.values, regularHundredths: 4000 },
      revision: draft.revision,
    })
    expect(edited.forecasts).toHaveLength(2)
    expect(edited.forecasts[0]).toEqual(draft.forecasts[0])
    const viewer = await testUser(f.app, 'Viewer')
    f.grant(viewer.id, 'viewer')
    expect(
      (
        await f.send(
          'POST',
          `/income/payroll/weeks/${draft.id}/cancel`,
          { revision: edited.revision, reason: 'Delete' },
          viewer.cookie,
        )
      ).statusCode,
    ).toBe(403)
    const outsider = await testUser(f.app, 'Outsider')
    expect(
      (
        await f.send(
          'POST',
          `/income/payroll/weeks/${draft.id}/cancel`,
          { revision: edited.revision, reason: 'Delete' },
          outsider.cookie,
        )
      ).statusCode,
    ).toBeGreaterThanOrEqual(403)
    expect(
      (
        await f.send('POST', `/income/payroll/weeks/${draft.id}/cancel`, {
          revision: draft.revision,
          reason: 'Delete',
        })
      ).statusCode,
    ).toBe(409)
    await f.ok('POST', `/income/payroll/weeks/${draft.id}/cancel`, {
      revision: edited.revision,
      reason: 'Delete fictional estimate',
    })
    expect((await f.ok('GET', '/income/payroll')).weeks).toHaveLength(0)
    expect(
      (
        await f.send('PATCH', `/income/payroll/weeks/${draft.id}`, {
          ...body,
          revision: edited.revision + 1,
        })
      ).statusCode,
    ).toBe(404)
    const restored = await f.ok('POST', '/income/payroll/weeks', {
      ...body,
      idempotencyKey: randomUUID(),
    })
    expect(restored.id).toBe(draft.id)
    expect(restored.forecasts).toHaveLength(3)
    const imported = await f.ok('POST', '/income/payroll/upload/save', {
      sourceId: f.source.id,
      receipt: await f.receipt(),
      statement,
      idempotencyKey: randomUUID(),
    })
    expect(
      (
        await f.send('POST', `/income/payroll/weeks/${imported.id}/cancel`, {
          revision: imported.revision,
          reason: 'Must reject',
        })
      ).statusCode,
    ).toBe(409)
    const app = await f.restart()
    const after = (await testRequest(app, 'GET', f.base + '/income/payroll', f.owner.cookie)).json()
    expect(after.weeks[0].statement.netCents).toBe(statement.netCents)
    expect(after.weeks[0].forecasts.slice(0, 2)).toEqual(edited.forecasts)
  },
)
