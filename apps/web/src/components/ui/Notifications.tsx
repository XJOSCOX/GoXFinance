import { useState, type ReactNode } from 'react'
import { toneStyles, type SemanticTone } from './semantic-tones'
import { X } from 'lucide-react'
import { NotificationContext, type Notify, type Tone } from './useNotify'

type Notice = { id: number; tone: Tone; message: string }
const noticeTones: Record<Tone, SemanticTone> = {
  success: 'positive',
  error: 'negative',
  warning: 'warning',
  info: 'info',
}
let nextId = 0

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  function dismiss(id: number) {
    setNotices((current) => current.filter((notice) => notice.id !== id))
  }
  const notify: Notify = (tone, message) => {
    const id = ++nextId
    setNotices((current) => [...current.slice(-3), { id, tone, message }])
    window.setTimeout(() => dismiss(id), 6000)
  }
  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {notices.map((notice) => (
          <div
            key={notice.id}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-[#252825] p-4 text-sm shadow-xl ${toneStyles[noticeTones[notice.tone]].border + ' ' + toneStyles[noticeTones[notice.tone]].text}`}
          >
            <span className="flex-1">
              <span className="mr-2 font-semibold capitalize">{notice.tone}</span>
              {notice.message}
            </span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(notice.id)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}
