// Isolated QA server. QA_DATA_DIR retains a dedicated qa.sqlite across manual-test restarts.
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../app'
import { testHome, testRequest, testRole, testUser } from './workspace'

const persistent = Boolean(process.env.QA_DATA_DIR)
const directory = persistent ? resolve(process.env.QA_DATA_DIR!) : mkdtempSync(join(tmpdir(), 'goxfinance-browser-'))
const databasePath = join(directory, 'qa.sqlite')
const app = await buildApp({ databasePath, frontendOrigin: 'http://localhost:1421', secureCookie: false })
const root = resolve('apps/web/dist')
app.get('/*', (request, reply) => {
  if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' })
  const candidate = resolve(root, decodeURIComponent(request.url.split('?')[0]).replace(/^\//, ''))
  const target = candidate.startsWith(root + sep) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, 'index.html')
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
  return reply.type(mime[extname(target)] ?? 'application/octet-stream').send(readFileSync(target))
})
const origin = 'http://localhost:1421'
if (!persistent) {
  const owner = await testUser(app, 'Owner', origin), admin = await testUser(app, 'Admin', origin)
  const { home, member } = await testHome(app, owner.cookie, origin)
  const adminMember = testRole(databasePath, home, admin.id, 'admin')
  const debtId = (await testRequest(app, 'POST', `/api/households/${home}/debts`, owner.cookie, {
    creditorName: 'QA Example Bank', accountType: 'auto_loan', currentBalanceCents: 100000,
    memberAssignments: [member, adminMember].map(memberId => ({ memberId, responsibility: 'joint' })),
  }, origin)).json().debt.id as string
  await testRequest(app, 'POST', `/api/households/${home}/debts/${debtId}/payments`, owner.cookie, { idempotencyKey: randomUUID(),
    amountCents: 10000, paymentDate: '2026-01-10', paymentStatus: 'completed', paymentMethod: 'bank_transfer', principalAmountCents: 8000 }, origin)
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  void app.close().then(() => { if (!persistent) rmSync(directory, { recursive: true, force: true }); process.exit() })
})
await app.listen({ host: '127.0.0.1', port: 1421 })
console.info(persistent ? 'Empty/manual QA site: http://localhost:1421 (dedicated qa.sqlite retained)' : 'Isolated QA site: http://localhost:1421 — owner@example.com / admin@example.com; password: long test password')
