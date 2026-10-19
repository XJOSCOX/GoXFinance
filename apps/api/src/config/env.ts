import 'dotenv/config'
import { resolve } from 'node:path'
import { z } from 'zod'

const environment = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_ORIGIN: z.url().default('http://localhost:1420'),
  DATA_DIR: z.string().default('./data'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).parse(process.env)

export const config = {
  port: environment.API_PORT,
  frontendOrigin: environment.FRONTEND_ORIGIN.replace(/\/$/, ''),
  databasePath: resolve(environment.DATA_DIR, 'goxfinance_web.sqlite'),
  secureCookie: environment.NODE_ENV === 'production',
}
