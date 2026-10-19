import { useEffect, useState } from 'react'

const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const fullTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
const shortTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const zoneTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })

export function LocalDateTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => setNow(new Date())
    const interval = window.setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', update) }
  }, [])
  return <time dateTime={now.toISOString()} title={fullDate.format(now) + ' · ' + zoneTime.format(now)} className="flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap text-right leading-tight">
    <span className="hidden text-[11px] text-slate-500 sm:block">{fullDate.format(now)}</span>
    <span className="text-[10px] text-slate-500 sm:hidden">{shortDate.format(now)}</span>
    <span className="hidden text-xs tabular-nums text-slate-300 sm:block">{fullTime.format(now)}</span>
    <span className="text-[11px] tabular-nums text-slate-300 sm:hidden">{shortTime.format(now)}</span>
  </time>
}
