import { importRepository } from './modules/banking/imports/import.repository'
import { importService } from './modules/banking/imports/import.service'
import { registerImportRoutes } from './modules/banking/imports/import.routes'
import { bankRepository } from './modules/banking/bank.repository'
import { bankPermissions } from './modules/banking/bank.permissions'
import { bankService } from './modules/banking/bank.service'
import { registerBankRoutes } from './modules/banking/bank.routes'
import { reportSources } from './modules/reports/report.sources'
import { reportService } from './modules/reports/report.service'
import { registerReportRoutes } from './modules/reports/report.routes'
import { assetRepository } from './modules/assets/asset.repository'
import { assetService } from './modules/assets/asset.service'
import { registerAssetRoutes } from './modules/assets/asset.routes'
import { forecastRepository } from './modules/forecasts/forecast.repository'
import { forecastService } from './modules/forecasts/forecast.service'
import { registerForecastRoutes } from './modules/forecasts/forecast.routes'
import { planningRepository } from './modules/debt-planning/planning.repository'
import { planningService } from './modules/debt-planning/planning.service'
import { registerPlanningRoutes } from './modules/debt-planning/planning.routes'
import { budgetRepository } from './modules/budgets/budget.repository'
import { budgetService } from './modules/budgets/budget.service'
import { registerBudgetRoutes } from './modules/budgets/budget.routes'
import { payoutBatchService } from './modules/trading/payout-batch.service'
import { tradingRepository } from './modules/trading/trading.repository'
import { tradingPermissions } from './modules/trading/trading.permissions'
import { tradingService } from './modules/trading/trading.service'
import { payoutService } from './modules/trading/payout.service'
import { copyRepository } from './modules/trading/copy.repository'
import { copyService } from './modules/trading/copy.service'
import { registerTradingRoutes } from './modules/trading/trading.routes'
import { goalRepository } from './modules/goals/goal.repository'
import { goalService } from './modules/goals/goal.service'
import { registerGoalRoutes } from './modules/goals/goal.routes'
import { categoryRepository } from './modules/categories/category.repository'
import { categoryService } from './modules/categories/category.service'
import { registerCategoryRoutes } from './modules/categories/category.routes'
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
import type { DatabaseSecurity } from './db/encryption/sqlite-engine'
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
import { FinancialError, financialAccess } from './modules/households/financial-access'
import { registerOverviewRoutes } from './modules/overview/overview.routes'
import { overviewRepository } from './modules/overview/overview.repository'
import { overviewService } from './modules/overview/overview.service'

type AppOptions = {
  databasePath: string
  frontendOrigin: string
  secureCookie: boolean
  sessionCookieName?: string
  databaseSecurity?: DatabaseSecurity
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: false })
  const { db, sqlite } = openDatabase(options.databasePath, options.databaseSecurity)
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
  const auth = authService(authRepository(db), invitations, options.sessionCookieName)
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
  registerCategoryRoutes(
    app,
    auth,
    categoryService(categoryRepository(db), financialAccess(householdStore, memberStore)),
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
  const tradeStore = tradingRepository(db)
  const tradeAccess = tradingPermissions(financialAccess(householdStore, memberStore))
  const trading = tradingService(tradeStore, tradeAccess)
  const income = incomeService(
    incomeRepository(db),
    incomePermissions(financialAccess(householdStore, memberStore)),
    (home, id) => {
      if (
        tradeStore
          .payouts(home)
          .some((p) => p.incomeTransactionId === id || p.existingIncomeTransactionId === id)
      )
        throw new FinancialError(
          'Correct this deposit through its Trading payout to keep records synchronized',
          409,
        )
    },
  )
  const payouts = payoutService(tradeStore, trading, tradeAccess, income)
  const copier = copyService(copyRepository(db), tradeStore, trading, tradeAccess)
  registerTradingRoutes(
    app,
    auth,
    trading,
    payouts,
    copier,
    payoutBatchService(copyRepository(db), tradeStore, trading, payouts, tradeAccess),
  )
  const goals = goalService(goalRepository(db), tradeAccess, (user, home) => ({
    accounts: trading.accounts(user, home),
    results: trading.results(user, home),
    ...copier.list(user, home),
    income: income.list(user, home).transactions,
    bills: bills.list(user, home),
    expenses: expenses.list(user, home).expenses,
    debts: debts.list(user, home).debts,
    balances: overviewRepository(db).balances(home),
  }))
  registerGoalRoutes(app, auth, goals)
  registerBudgetRoutes(
    app,
    auth,
    budgetService(budgetRepository(db), tradeAccess, (user, home) => ({
      bills: bills.list(user, home),
      expenses: expenses.list(user, home).expenses,
      categories: categoryService(
        categoryRepository(db),
        financialAccess(householdStore, memberStore),
      ).list(user, home).categories,
    })),
  )
  registerPlanningRoutes(
    app,
    auth,
    planningService(planningRepository(db), tradeAccess, debts, payments),
  )
  registerForecastRoutes(
    app,
    auth,
    forecastService(forecastRepository(db), tradeAccess, (user, home) => ({
      bills: bills.list(user, home),
      debts: debts.list(user, home).debts,
      payments: overviewRepository(db).payments(home),
      income: income.list(user, home),
      expenses: expenses.list(user, home).expenses,
      categories: categoryService(
        categoryRepository(db),
        financialAccess(householdStore, memberStore),
      ).list(user, home).categories,
      budgets: budgetRepository(db)
        .all(home)
        .map((b) => ({ ...b, status: b.status as 'active' | 'archived', canManage: false })),
      offers: planningRepository(db)
        .offers(home)
        .map((o) => ({ ...o, canManage: false })),
    })),
  )
  registerAssetRoutes(
    app,
    auth,
    assetService(assetRepository(db), tradeAccess, debts, (home) =>
      overviewRepository(db).balances(home),
    ),
  )
  registerReportRoutes(
    app,
    auth,
    reportService(
      financialAccess(householdStore, memberStore),
      reportSources(
        { debts, bills, expenses, income, trading, payouts, copier, goals },
        {
          assets: assetRepository(db),
          planning: planningRepository(db),
          forecasts: forecastRepository(db),
          budgets: budgetRepository(db),
          overview: overviewRepository(db),
        },
      ),
    ),
  )
  const bankStore = bankRepository(db),
    bankAccess = bankPermissions(financialAccess(householdStore, memberStore), bankStore),
    banks = bankService(bankStore, bankAccess, assetRepository(db), debts)
  registerBankRoutes(app, auth, banks)
  const imports = importService(bankStore, importRepository(db), bankAccess, banks)
  registerImportRoutes(app, auth, imports)
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
