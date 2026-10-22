import { useEffect, useState } from 'react'
import { commandCenterSchema, type CommandCenter } from '@goxfinance/shared'
import { apiRequest, errorMessage } from '../../lib/api'
export function useCommandCenter(home: string, month: string) {
  const [data, setData] = useState<CommandCenter | null>(null)
  const [error, setError] = useState(''),
    [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    if (home)
      void apiRequest(`households/${home}/command-center?month=${month}`)
        .then((value) => {
          if (active) setData(commandCenterSchema.parse(value))
        })
        .catch((e) => {
          if (active) setError(errorMessage(e))
        })
    return () => {
      active = false
    }
  }, [home, month, reload])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setReload((n) => n + 1), 100)
    }
    const visible = () => {
      if (document.visibilityState === 'visible') update()
    }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  return { data, error, refresh: () => setReload((n) => n + 1) }
}
