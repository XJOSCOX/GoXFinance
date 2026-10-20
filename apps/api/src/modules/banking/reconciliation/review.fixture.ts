import { randomUUID } from 'node:crypto'
import type { BankProposal } from '@goxfinance/shared'
import { setup } from '../../../testing/financial-workspace'
import { create } from '../../trading/trading.fixture'
import { statementInput } from '../imports/import.fixture'
export async function reviewFixture(encrypted = false) {
  const f = await setup(encrypted),
    account = (
      await f.ok(
        'POST',
        '/banking/accounts',
        create({
          name: 'Fictional review account',
          institution: 'Fictional bank',
          type: 'checking',
          subtype: null,
          mask: '1234',
          currency: 'USD',
          memberIds: [f.member],
          status: 'active',
          assetId: null,
          debtId: null,
        }),
      )
    ).record
  async function importRow(
    amount: string,
    description = 'Fictional purchase',
    day = '2026-10-01',
    accountId = account.id,
    cookie = f.owner.cookie,
  ) {
    const input = statementInput(
        accountId,
        `date,description,amount\n${day},${description},${amount}`,
      ),
      preview = await f.ok('POST', '/banking/imports/preview', input, cookie)
    await f.ok(
      'POST',
      '/banking/imports/confirm',
      {
        input,
        previewHash: preview.hash,
        selectedRows: [0],
        confirmPossibleDuplicates: true,
        idempotencyKey: randomUUID(),
      },
      cookie,
    )
    return (await f.ok('GET', '/banking/inbox', undefined, cookie)).transactions.find(
      (t: { description: string; accountId: string }) =>
        t.description === description && t.accountId === accountId,
    )
  }
  async function review(
    id: string,
    proposal: BankProposal,
    cookie = f.owner.cookie,
    newRecordConfirmed = false,
  ) {
    const options = await f.ok('GET', `/banking/transactions/${id}/review`, undefined, cookie),
      body = { revision: options.transaction.revision, proposal, newRecordConfirmed },
      preview = await f.ok('POST', `/banking/transactions/${id}/preview`, body, cookie),
      submission = { ...body, fingerprint: preview.fingerprint, idempotencyKey: randomUUID() },
      result = await f.ok('POST', `/banking/transactions/${id}/reconcile`, submission, cookie)
    return { result, submission }
  }
  async function expenseProposal(
    id: string,
    amount = 4218,
    member = f.member,
    credit = false,
  ): Promise<BankProposal> {
    const options = await f.ok('GET', `/banking/transactions/${id}/review`),
      category = options.categories[0]
    return {
      classification: 'expense',
      expenseId: null,
      expense: {
        responsibleMemberId: member,
        description: 'Fictional reviewed purchase',
        merchant: 'Fictional shop',
        amountCents: amount,
        transactionDate: '2026-10-01',
        paymentMethod: credit ? 'credit_card' : 'bank_transfer',
        linkedDebtId: null,
        notes: null,
        allocations: [{ categoryId: category.id, amountCents: amount }],
      },
    }
  }
  return { ...f, account, importRow, review, expenseProposal }
}
