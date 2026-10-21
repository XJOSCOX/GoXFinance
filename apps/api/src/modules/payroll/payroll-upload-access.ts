import type { PublicUser, IncomeSource, PayrollData } from '@goxfinance/shared'
export type PayrollUploadAccess = {
  source: (user: PublicUser, home: string, id: string, write?: boolean) => IncomeSource
  list: (user: PublicUser, home: string) => PayrollData
  createMember: (user: PublicUser, home: string) => { id: string; name: string } | undefined
}
