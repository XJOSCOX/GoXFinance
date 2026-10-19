import { useCallback, useEffect, useState } from 'react'
import type { Debt, Expense, ExpenseCategory, HouseholdMember } from '@goxfinance/shared'
import { errorMessage } from '../../../lib/api'
import { listMembers } from '../../households/api/householdClient'
import { listDebts } from '../../debts/api/debtClient'
import { initializeExpenses, listExpenses } from '../api/expenseClient'

export function useExpenses(householdId: string) {
  const [data, setData] = useState<{
    expenses: Expense[]
    categories: ExpenseCategory[]
    members: HouseholdMember[]
    debts: Debt[]
  }>({ expenses: [], categories: [], members: [], debts: [] })
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  const fetchData = useCallback(async () => {
    await initializeExpenses(householdId)
    const [result, people, accounts] = await Promise.all([
      listExpenses(householdId),
      listMembers(householdId),
      listDebts(householdId),
    ])
    return {
      expenses: result.expenses,
      categories: result.categories,
      members: people.members,
      debts: accounts.debts,
    }
  }, [householdId])
  const refresh = useCallback(async () => {
    setData(await fetchData())
    setError('')
  }, [fetchData])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData({ expenses: [], categories: [], members: [], debts: [] })
    void fetchData()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchData])
  return { ...data, error, setError, loading, refresh }
}
