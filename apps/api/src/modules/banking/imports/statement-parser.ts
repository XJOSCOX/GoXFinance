import { parseString } from '@fast-csv/parse'
import {
  bankDecimalCents,
  bankTransactionSchema,
  type BankTransactionInput,
  type ManualImportInput,
} from '@goxfinance/shared'
import { FinancialError } from '../../households/financial-access'
export function safeBankText(text: string) {
  return text.trim().replace(/\b\d{5,}\b/g, (n) => '••••' + n.slice(-4))
}
export function csvRows(text: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const rows: string[][] = []
    parseString(text, { headers: false, ignoreEmpty: true, trim: true, maxRows: 5002 })
      .on('error', () =>
        reject(
          new FinancialError('Invalid CSV. Check quoting, delimiters and column counts.', 400),
        ),
      )
      .on('data', (row: string[]) => rows.push(row))
      .on('end', () => {
        if (rows.length > 5001 || rows.some((r) => r.length > 40))
          return reject(new FinancialError('Use at most 5,000 transactions and 40 columns.', 400))
        if (
          !rows.length ||
          rows[0].some((h) => !h || h.length > 80) ||
          new Set(rows[0]).size !== rows[0].length
        )
          return reject(
            new FinancialError(
              'CSV needs unique nonempty column names of at most 80 characters.',
              400,
            ),
          )
        resolve(rows)
      })
  })
}
function date(value: string, format: ManualImportInput['dateFormat']) {
  const text = value.trim()
  if (format === 'iso') return text.slice(0, 10)
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text)
  if (!m) throw new Error('Date does not match the chosen format')
  return `${m[3]}-${(format === 'mdy' ? m[1] : m[2]).padStart(2, '0')}-${(format === 'mdy' ? m[2] : m[1]).padStart(2, '0')}`
}
const money = (v: string) => bankDecimalCents(v.trim().replace(/^\((.*)\)$/, '-$1'))
function decode(value: string) {
  return value
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, k: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[k]!,
    )
    .trim()
}
export function ofxRows(text: string, currency: string | null): BankTransactionInput[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new FinancialError('OFX declarations and external entities are not supported.', 400)
  const blocks = [...text.matchAll(/<STMTTRN\s*>([\s\S]*?)<\/STMTTRN\s*>/gi)]
  if (
    !blocks.length ||
    blocks.length > 5000 ||
    [...text.matchAll(/<STMTTRN\s*>/gi)].length !== blocks.length
  )
    throw new FinancialError(
      'Use a supported OFX/QFX statement with 1–5,000 closed STMTTRN records.',
      400,
    )
  const field = (block: string, tag: string) =>
    decode(new RegExp('<' + tag + '\\s*>([^<\\r\\n]*)', 'i').exec(block)?.[1] ?? '')
  const currencies = [...text.matchAll(/<CURDEF\s*>([^<\r\n]*)/gi)].map((m) =>
    m[1].trim().toUpperCase(),
  )
  if (new Set(currencies).size > 1 || (currency && currencies.some((c) => c !== currency)))
    throw new FinancialError('Statement currency must match the selected account.', 400)
  currency = currencies[0] || currency
  return blocks.map(([, b]) => {
    const d = field(b, 'DTPOSTED'),
      ref = field(b, 'FITID'),
      name = field(b, 'NAME'),
      memo = field(b, 'MEMO')
    if (!/^\d{8}/.test(d) || !ref || /<STMTTRN/i.test(b))
      throw new FinancialError(
        'OFX transaction dates and unique FITID references are required.',
        400,
      )
    return bankTransactionSchema.parse({
      date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8),
      authorizedDate: null,
      amountCents: money(field(b, 'TRNAMT')),
      currency,
      pending: false,
      merchant: name ? safeBankText(name) : null,
      description: safeBankText(memo || name || 'Statement transaction'),
      externalId: ref,
    })
  })
}
export async function parseStatement(input: ManualImportInput, currency: string | null) {
  if (input.format === 'ofx')
    return ofxRows(input.text, currency).map((values, index) => ({
      index,
      values,
      error: null as string | null,
    }))
  const [headers, ...rows] = await csvRows(input.text),
    m = input.mapping
  for (const key of Object.values(m))
    if (key && !headers.includes(key))
      throw new FinancialError('A mapped CSV column is missing.', 400)
  if (!m.date || !m.description || (!m.amount && !(m.debit || m.credit)))
    throw new FinancialError('Map a date, description and amount or debit/credit columns.', 400)
  return rows.map((r, index) => {
    try {
      if (r.length !== headers.length) throw new Error('Column count does not match the header')
      const get = (name: string) => (name ? (r[headers.indexOf(name)] ?? '') : '')
      let amount = m.amount
        ? money(get(m.amount))
        : money(get(m.credit) || '0') - money(get(m.debit) || '0')
      if (!m.amount && (money(get(m.credit) || '0') < 0 || money(get(m.debit) || '0') < 0))
        throw new Error('Debit/credit columns must be positive')
      if (m.amount && input.sign === 'outflow_positive') amount = -amount
      const pending = get(m.pending).toLowerCase()
      if (
        !['', 'pending', 'posted', 'true', 'false', 'yes', 'no', '1', '0', 'completed'].includes(
          pending,
        )
      )
        throw new Error('Unknown pending/posted value')
      const values = bankTransactionSchema.parse({
        date: date(get(m.date), input.dateFormat),
        authorizedDate: null,
        amountCents: amount,
        currency: get(m.currency) || currency,
        pending: ['pending', 'true', 'yes', '1'].includes(pending),
        merchant: get(m.merchant) ? safeBankText(get(m.merchant)) : null,
        description: safeBankText(get(m.description)),
        externalId: get(m.reference) || null,
      })
      if (currency && values.currency !== currency) throw new Error('Account currency mismatch')
      return { index, values, error: null as string | null }
    } catch {
      return {
        index,
        values: null,
        error:
          'Invalid amount, date, currency, status or mapped fields. Correct the row or leave it unselected.',
      }
    }
  })
}
