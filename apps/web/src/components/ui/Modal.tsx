import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Modal({ title, onClose, children, className, framed = false }: { title: string; onClose: () => void; children: ReactNode; className?: string; framed?: boolean }) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (document.querySelectorAll('[role="dialog"]')[document.querySelectorAll('[role="dialog"]').length - 1] !== dialog.current) return
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex="0"]'))
        .filter(element => element.getClientRects().length > 0)
      if (!focusable.length) return
      if (event.shiftKey && (document.activeElement === focusable[0] || document.activeElement === dialog.current)) { event.preventDefault(); focusable.at(-1)?.focus() }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [])

  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      className={cn('surface-card max-h-[min(90dvh,900px)] w-full max-w-lg rounded-xl border border-white/10 bg-[#1b1d1c] shadow-2xl outline-none', framed ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto p-6', className)}>
      <div className={cn('flex shrink-0 items-center justify-between gap-4', framed ? 'border-b border-white/[.08] px-5 py-4 sm:px-7 sm:py-5' : 'mb-5')}><h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        <button type="button" aria-label="Close dialog" className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white" onClick={onClose}><X size={19}/></button>
      </div>
      {children}
    </div>
  </div>, document.body)
}
