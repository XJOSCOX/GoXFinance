import { randomUUID } from 'node:crypto'
import { setup } from '../../testing/financial-workspace'
import { testRequest } from '../../testing/workspace'
import { incomeSourceSchema } from '@goxfinance/shared'
import { profile } from '../../../../../packages/shared/src/payroll.fixture'
import { signUploadReceipt } from './payroll-upload-receipt'
export async function uploadFixture(encrypted = false, withProfile = true) {
  const f = await setup(encrypted),
    source = (
      await f.ok('POST', '/income/sources', {
        idempotencyKey: randomUUID(),
        values: incomeSourceSchema.parse({
          responsibleMemberId: f.member,
          name: 'Fictional assignment',
          incomeType: 'hourly',
          frequency: 'weekly',
          hourlyRateCents: 2500,
          expectedGrossCents: null,
          expectedNetCents: null,
          payday: 4,
          overtimeMultiplier: '1.5',
          status: 'active',
          notes: null,
        }),
      })
    ).source
  if (withProfile)
    await testRequest(f.app, 'PUT' as never, f.base + '/income/payroll/profile', f.owner.cookie, {
      revision: 0,
      reason: 'Synthetic configuration',
      values: { ...profile, sourceId: source.id },
    })
  async function receipt(digest = randomUUID().replaceAll('-', '').repeat(2)) {
    const data = await f.ok('GET', '/income/payroll')
    return signUploadReceipt({
      createMemberId: f.member,
      home: f.home,
      actor: f.owner.id,
      digest,
      receivedAt: new Date().toISOString(),
      weeks: Object.fromEntries(
        data.weeks.map((w: { id: string; revision: number }) => [w.id, w.revision]),
      ),
      profiles: { [source.id]: data.profiles[0]?.revision ?? 0 },
    })
  }
  return { ...f, source, receipt }
}
