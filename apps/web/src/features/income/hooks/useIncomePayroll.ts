import { useEffect, useState } from 'react'
import type { IncomeTransaction, PayrollWeek } from '@goxfinance/shared'
import { loadPayroll } from '../payroll/payrollClient'
import { errorMessage } from '../../../lib/api'
export function useIncomePayroll(home: string, transactions: IncomeTransaction[]) {
  const [state, setState] = useState<{
    home: string
    weeks: PayrollWeek[]
    loading: boolean
    error: string
  }>({ home: '', weeks: [], loading: true, error: '' })
  useEffect(() => {
    let active = true
    setState({ home, weeks: [], loading: true, error: '' })
    void loadPayroll(home)
      .then((data) => {
        if (active) setState({ home, weeks: data.weeks, loading: false, error: '' })
      })
      .catch((e) => {
        if (active) setState({ home, weeks: [], loading: false, error: errorMessage(e) })
      })
    return () => {
      active = false
    }
  }, [home, transactions])
  return state.home === home ? state : { weeks: [], loading: true, error: '' }
}
