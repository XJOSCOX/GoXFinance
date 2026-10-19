import { useEffect, useState } from 'react'
import { localBillDate } from '@goxfinance/shared'

// Keep payday reminders current if the page stays open across midnight.
export function useIncomeToday() {
  const [today, setToday] = useState(localBillDate)
  useEffect(() => {
    const timer = setInterval(() => setToday(localBillDate()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return today
}
