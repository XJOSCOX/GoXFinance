import { describe, expect, it } from 'vitest'
import { statementInput } from './import.fixture'
import { bankSuggestion } from '@goxfinance/shared'
import { csvRows, ofxRows, parseStatement, safeBankText } from './statement-parser'
describe('limited local statement parsing', () => {
  it('handles quoted commas, exact cents, nullable currency and explicit sign conventions', async () => {
    const input = statementInput(
      undefined,
      'date,description,amount\n2026-10-01,"Fictional, shop",12.30',
    )
    expect((await parseStatement(input, null))[0].values).toMatchObject({
      description: 'Fictional, shop',
      amountCents: 1230,
      currency: null,
    })
    expect(
      (await parseStatement({ ...input, sign: 'outflow_positive' }, 'USD'))[0].values?.amountCents,
    ).toBe(-1230)
    expect(safeBankText('Ref 123456789012')).toBe('Ref ••••9012')
  })
  it('parses separate debit and credit and explicit day/month order', async () => {
    const input = statementInput(
      undefined,
      'date,description,debit,credit\n02/03/2026,Purchase,342.18,\n03/03/2026,Refund,,200.00',
    )
    input.dateFormat = 'dmy'
    input.mapping = { ...input.mapping, amount: '', debit: 'debit', credit: 'credit' }
    const rows = await parseStatement(input, 'USD')
    expect(rows.map((r) => [r.values?.date, r.values?.amountCents])).toEqual([
      ['2026-03-02', -34218],
      ['2026-03-03', 20000],
    ])
  })
  it('rejects invalid dates, fractional cents, invalid pending flags and currency mismatches per row', async () => {
    const input = statementInput(
      undefined,
      'date,description,amount,currency,pending\n2026-02-30,Bad date,1,USD,false\n2026-10-01,Bad cents,1.001,USD,false\n2026-10-01,Other currency,1,EUR,false\n2026-10-01,Bad flag,1,USD,maybe\n2026-10-01,Good,-1.01,USD,pending',
    )
    input.mapping.currency = 'currency'
    input.mapping.pending = 'pending'
    const rows = await parseStatement(input, 'USD')
    expect(rows.map((r) => !!r.values)).toEqual([false, false, false, false, true])
    expect(rows[4].values).toMatchObject({ pending: true, amountCents: -101 })
  })
  it('rejects malformed or excessive CSV and nonexistent mappings', async () => {
    await expect(csvRows('a,a\n1,2')).rejects.toThrow('unique')
    await expect(csvRows('a,b\n"unclosed')).rejects.toThrow('Invalid CSV')
    await expect(csvRows('a\n' + '1\n'.repeat(5001))).rejects.toThrow('5,000')
    const input = statementInput()
    input.mapping.amount = 'missing'
    await expect(parseStatement(input, 'USD')).rejects.toThrow('missing')
  })
  it('parses closed OFX/QFX records without reading full account numbers or external entities', () => {
    const sample =
      '<OFX><CURDEF>USD<ACCTID>123456789<STMTTRN><DTPOSTED>20261001120000<TRNAMT>-42.18<FITID>fictional-1<NAME>Fictional &amp; shop</STMTTRN></OFX>'
    expect(ofxRows(sample, 'USD')[0]).toMatchObject({
      date: '2026-10-01',
      amountCents: -4218,
      merchant: 'Fictional & shop',
      externalId: 'fictional-1',
    })
    expect(JSON.stringify(ofxRows(sample, 'USD'))).not.toContain('123456789')
    expect(() => ofxRows(sample, 'EUR')).toThrow('currency')
    expect(() => ofxRows(sample + '<STMTTRN>', 'USD')).toThrow('closed')
    expect(() => ofxRows('<!DOCTYPE foo>' + sample, 'USD')).toThrow('entities')
  })
  it('requires description evidence rather than sign alone for suggestions', () => {
    expect(bankSuggestion(null, 'Unknown deposit', 100, false).classification).toBeNull()
    expect(bankSuggestion(null, 'Payroll deposit', 100, true).classification).toBeNull()
    expect(bankSuggestion(null, 'Payroll deposit', 100, false).classification).toBe('income')
    expect(bankSuggestion(null, 'Card payment thank you', 100, true).classification).toBe(
      'transfer',
    )
  })
})
