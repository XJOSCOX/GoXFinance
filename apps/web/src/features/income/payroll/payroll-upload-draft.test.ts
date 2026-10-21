import { expect, it } from 'vitest'
import type { PayrollStatement, PayrollUploadSource } from '@goxfinance/shared'
import { chooseUploadDraft } from './payroll-upload-draft'
const draft = { id: 'draft', start: '2026-11-11', end: '2026-11-15', payDate: '2026-11-20' },
  source = { drafts: [draft] } as PayrollUploadSource,
  statement = {
    periodStart: '2026-11-09',
    periodEnd: '2026-11-15',
    payDate: '2026-11-20',
  } as PayrollStatement
it('suggests a unique matching estimate or a valid explicit target and respects clearing it', () => {
  expect(chooseUploadDraft(source, statement)).toBe('draft')
  expect(chooseUploadDraft(source, statement, undefined, '')).toBeUndefined()
  expect(
    chooseUploadDraft({ ...source, drafts: [draft, { ...draft, id: 'second' }] }, statement),
  ).toBeUndefined()
  expect(
    chooseUploadDraft(
      { ...source, drafts: [draft, { ...draft, id: 'second' }] },
      statement,
      'second',
    ),
  ).toBe('second')
  expect(chooseUploadDraft(undefined, statement, 'draft')).toBeUndefined()
})
