import { incomeRepository } from './modules/income/income.repository'
import { incomeService } from './modules/income/income.service'
import { incomePermissions } from './modules/income/income.permissions'
import { registerIncomeRoutes } from './modules/income/income.routes'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { openDatabase } from './db/connection'
import { registerCsrfGuard } from './middleware/csrf'
import { authRepository } from './modules/auth/auth.repository'
import { registerAuthRoutes } from './modules/auth/auth.routes'
import { AuthError, authService } from './modules/auth/auth.service'
import { householdRepository } from './modules/households/household.repository'
import { memberRepository } from './modules/households/member.repository'
import { householdService } from './modules/households/household.service'
import { memberService } from './modules/households/member.service'
import { registerHouseholdRoutes } from './modules/households/household.routes'
import { HouseholdError } from './modules/households/household.permissions'
import { invitationRepository } from './modules/households/invitation.repository'
import { InvitationError, invitationService } from './modules/households/invitation.service'
import { accessRepository } from './modules/households/access.repository'
import { accessService } from './modules/households/access.service'
import { memberRequestRepository } from './modules/households/member-request.repository'
import { memberRequestService } from './modules/households/member-request.service'
import { debtRepository } from './modules/debts/debt.repository'
import { DebtError, debtService } from './modules/debts/debt.service'
import { registerDebtRoutes } from './modules/debts/debt.routes'
import { paymentRepository } from './modules/debt-payments/payment.repository'
import { PaymentError, paymentService } from './modules/debt-payments/payment.service'
import { registerPaymentRoutes } from './modules/debt-payments/payment.routes'
import { changeRepository } from './modules/debt-changes/change.repository'
import { changeService } from './modules/debt-changes/change.service'
import { registerChangeRoutes } from './modules/debt-changes/change.routes'
import { registerBackupRoutes } from './modules/recovery/backup.routes'
import { hasQueuedRestore } from './db/sqlite-backups'
import { billRepository } from './modules/bills/bill.repository'
import { BillError, billPermissions } from './modules/bills/bill.permissions'
import { billService } from './modules/bills/bill.service'
import { billRequestsService } from './modules/bills/bill-requests.service'
import { registerBillRoutes } from './modules/bills/bill.routes'
import { expenseRepository } from './modules/expenses/expense.repository'
import { expenseService } from './modules/expenses/expense.service'
import { registerExpenseRoutes } from './modules/expenses/expense.routes'
import { financialAccess } from './modules/households/financial-access'
import { registerOverviewRoutes } from './modules/overview/overview.routes'
import { overviewRepository } from './modules/overview/overview.repository'
import { overviewService } from './modules/overview/overview.service'

type AppOptions = { databasePath: string; frontendOrigin: string; secureCookie: boolean }

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: false })
  const { db, sqlite } = openDatabase(options.databasePath)
  app.addHook('onClose', async () => {
    sqlite.close()
  })
  await app.register(cors, { origin: options.frontendOrigin, credentials: true })
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store')
    return payload
  })
  registerCsrfGuard(app, options.frontendOrigin)
  app.addHook('onRequest', async (request, reply) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      hasQueuedRestore(options.databasePath)
    ) {
      return reply.code(503).send({
        code: 'RESTORE_PENDING',
        error: 'Database restore is queued. Restart the API before making changes.',
      })
    }
  })
  const householdStore = householdRepository(db)
  const memberStore = memberRepository(db)
  const invitationStore = invitationRepository(db)
  const invitations = invitationService(householdStore, memberStore, invitationStore)
  const auth = authService(authRepository(db), invitations)
  registerAuthRoutes(app, auth, options.secureCookie)
  registerHouseholdRoutes(
    app,
    auth,
    householdService(householdStore),
    memberService(householdStore, memberStore, invitationStore),
    invitations,
    accessService(householdStore, memberStore, accessRepository(db)),
    memberRequestService(householdStore, memberRequestRepository(db), memberStore),
  )
  const debts = debtService(householdStore, memberStore, debtRepository(db))
  registerDebtRoutes(app, auth, debts)
  const paymentStore = paymentRepository(db)
  const billStore = billRepository(db)
  const billAccess = billPermissions(householdStore, memberStore, debts, billStore)
  const payments = paymentService(debts, paymentStore, billAccess.guardDebtPayment)
  const bills = billService(billStore, billAccess, payments)
  const expenses = expenseService(
    expenseRepository(db),
    financialAccess(householdStore, memberStore),
    debts,
  )
  registerBillRoutes(app, auth, bills, billRequestsService(billStore, bills, billAccess))
  const income = incomeService(
    incomeRepository(db),
    incomePermissions(financialAccess(householdStore, memberStore)),
  )
  registerIncomeRoutes(app, auth, income)
  registerExpenseRoutes(app, auth, expenses)
  registerOverviewRoutes(
    app,
    auth,
    overviewService(overviewRepository(db), debts, bills, expenses, income),
  )
  registerPaymentRoutes(app, auth, payments)
  registerChangeRoutes(
    app,
    auth,
    changeService(householdStore, debts, payments, paymentStore, changeRepository(db)),
  )
  registerBackupRoutes(app, auth, sqlite, options.databasePath)
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ code: 'VALIDATION_ERROR', error: error.issues[0]?.message ?? 'Invalid input' })
    if (error instanceof InvitationError)
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    if (error instanceof AuthError)
      return reply.code(error.statusCode).send({ code: 'AUTH_ERROR', error: error.message })
    if (error instanceof HouseholdError)
      return reply.code(error.statusCode).send({ code: 'HOUSEHOLD_ERROR', error: error.message })
    if (error instanceof DebtError)
      return reply.code(error.statusCode).send({ code: 'DEBT_ERROR', error: error.message })
    if (error instanceof PaymentError)
      return reply.code(error.statusCode).send({ code: 'PAYMENT_ERROR', error: error.message })
    if (error instanceof BillError)
      return reply.code(error.statusCode).send({ code: 'FINANCIAL_ERROR', error: error.message })
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 429
    ) {
      return reply
        .code(429)
        .send({ code: 'RATE_LIMITED', error: 'Too many attempts. Try again later.' })
    }
    return reply.code(500).send({ code: 'INTERNAL_ERROR', error: 'Unable to complete the request' })
  })
  return app
}
