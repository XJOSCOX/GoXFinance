import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { payrollStatementSchema } from '@goxfinance/shared'
import { validatePayrollFile } from './file-validation'
import { FinancialError } from '../../households/financial-access'
const input = z
  .object({
    mime: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
    data: z
      .string()
      .min(8)
      .max(14 * 1024 * 1024),
  })
  .strict()
const active = new Set<string>()
export async function localDocumentPreview(actor: string, body: unknown, onAccepted?: () => void) {
  const p = input.parse(body)
  if (active.has(actor) || active.size >= 2)
    throw new FinancialError('A local document is already being processed. Try again shortly.', 429)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(p.data))
    throw new FinancialError('Invalid upload encoding', 400)
  const bytes = Buffer.from(p.data, 'base64')
  try {
    validatePayrollFile(bytes, p.mime)
  } catch {
    throw new FinancialError('Use a PDF, PNG or JPEG with matching contents, at most 10 MB.', 400)
  }
  active.add(actor)
  try {
    onAccepted?.()
    return await new Promise<{
      statement: z.infer<typeof payrollStatementSchema>
      warnings: string[]
      format: string
      usedOcr: boolean
      documentDigest: string
    }>((resolveResult, reject) => {
      const source = resolve('apps/api/src/modules/payroll/documents/worker.ts'),
        fromSource = import.meta.url.endsWith('.ts') && existsSync(source),
        child = fork(
          fromSource ? source : resolve('apps/api/dist/modules/payroll/documents/worker.js'),
          [],
          {
            execArgv: [...(fromSource ? ['--import', 'tsx'] : []), '--max-old-space-size=256'],
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            windowsHide: true,
            env: {
              PATH: process.env.PATH,
              SystemRoot: process.env.SystemRoot,
              TEMP: process.env.TEMP,
              TMP: process.env.TMP,
            },
          },
        ),
        timer = setTimeout(() => {
          child.kill()
          reject(
            new FinancialError(
              'Local document processing timed out. Try a smaller redacted document or manual entry.',
              408,
            ),
          )
        }, 90000)
      const cleanup = () => clearTimeout(timer)
      child.once(
        'message',
        (m: {
          ok: boolean
          result?: { statement: unknown; warnings: string[]; format: string; usedOcr: boolean }
        }) => {
          cleanup()
          if (!m.ok || !m.result)
            return reject(
              new FinancialError(
                'Local extraction could not read this document. Enter the statement manually.',
                422,
              ),
            )
          try {
            resolveResult({
              ...m.result,
              statement: payrollStatementSchema.parse(m.result.statement),
              documentDigest: createHash('sha256').update(bytes).digest('hex'),
            })
          } catch {
            reject(new FinancialError('Extracted values need manual entry', 422))
          }
        },
      )
      child.once('error', () => {
        cleanup()
        reject(new FinancialError('Local extraction worker could not start', 503))
      })
      child.once('exit', () => {
        cleanup()
        reject(new FinancialError('Local extraction ended before returning a preview', 422))
      })
      child.send(p)
    })
  } finally {
    active.delete(actor)
    bytes.fill(0)
  }
}
