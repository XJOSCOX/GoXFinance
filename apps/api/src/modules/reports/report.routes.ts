import { FinancialError } from '../households/financial-access'
import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { reportFilterSchema } from '@goxfinance/shared'
import type { AuthService } from '../auth/auth.service'
import type { ReportService } from './report.service'
import { reportCsv } from './report.csv'
import { reportXlsx } from './report.xlsx'
import { reportPdf } from './report.pdf'
export function registerReportRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReportService,
) {
  const base = '/api/households/:householdId/reports',
    params = z.object({ householdId: z.uuid() }),
    user = (r: FastifyRequest) => auth.currentUser(r.cookies[auth.sessionCookieName])
  app.get(base + '/options', (r) => service.options(user(r), params.parse(r.params).householdId))
  app.post(base + '/preview', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, (r) =>
    service.preview(user(r), params.parse(r.params).householdId, r.body),
  )
  app.post(
    base + '/export',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (r, reply) => {
      const body = z
          .object({ filters: reportFilterSchema, format: z.enum(['json', 'csv', 'xlsx', 'pdf']) })
          .strict()
          .parse(r.body),
        report = service.preview(user(r), params.parse(r.params).householdId, body.filters)
      if (
        body.format === 'pdf' &&
        report.tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0) > 20000
      )
        throw new FinancialError(
          'PDF report too large. Narrow the dates or choose CSV, JSON or Excel.',
          413,
        )
      const formats = {
        json: 'application/json',
        csv: 'text/csv; charset=utf-8',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
      }
      const output =
        body.format === 'json'
          ? Buffer.from(JSON.stringify(report, null, 2))
          : body.format === 'csv'
            ? Buffer.from(reportCsv(report))
            : body.format === 'xlsx'
              ? await reportXlsx(report)
              : await reportPdf(report)
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Disposition',
          `attachment; filename="goxfinance-${body.filters.kind}-${body.filters.from}-${body.filters.to}.${body.format}"`,
        )
        .type(formats[body.format])
        .send(output)
    },
  )
}
