import { useEffect, useState } from 'react'
import type { TradingData } from '@goxfinance/shared'
import { listTrading } from '../../trading/api/tradingClient'
import { errorMessage } from '../../../lib/api'
export function useOverviewTrading(home: string) {
  const [data, setData] = useState<TradingData | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    void listTrading(home)
      .then((value) => {
        if (active) setData(value)
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure))
      })
    return () => {
      active = false
    }
  }, [home, reload])
  return { data, error, retry: () => setReload((value) => value + 1) }
}
