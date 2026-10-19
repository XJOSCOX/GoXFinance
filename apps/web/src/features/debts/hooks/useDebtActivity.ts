import { useCallback, useEffect, useState } from 'react'
import type { DebtBalanceHistory, DebtPayment, DebtPaymentOverview } from '@goxfinance/shared'
import { errorMessage } from '../../../lib/api'
import { listBalanceHistory, listPayments } from '../api/paymentClient'

export function useDebtActivity(householdId: string, debtId: string) {
  const [payments, setPayments] = useState<DebtPayment[]>([])
  const [history, setHistory] = useState<DebtBalanceHistory[]>([])
  const [overview, setOverview] = useState<DebtPaymentOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [paymentData, balanceData] = await Promise.all([listPayments(householdId, debtId), listBalanceHistory(householdId, debtId)])
      setPayments(paymentData.payments)
      setHistory(balanceData.history)
      setOverview(balanceData.overview)
      setError('')
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setLoading(false) }
  }, [householdId, debtId])
  useEffect(() => { void refresh() }, [refresh])
  return { payments, history, overview, loading, error, refresh }
}
