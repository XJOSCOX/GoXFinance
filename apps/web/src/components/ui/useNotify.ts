import { createContext, useContext } from 'react'

export type Tone = 'success' | 'error' | 'warning' | 'info'
export type Notify = (tone: Tone, message: string) => void
export const NotificationContext = createContext<Notify | null>(null)

export function useNotify() {
  const notify = useContext(NotificationContext)
  if (!notify) throw new Error('NotificationProvider missing')
  return notify
}
