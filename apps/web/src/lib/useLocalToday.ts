import { useEffect, useState } from 'react'
import { localBillDate } from '@goxfinance/shared'

export function useLocalToday() {
  const [today, setToday] = useState(localBillDate)
  useEffect(() => {
    const refresh = () => setToday(localBillDate())
    const timer = setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return today
}
