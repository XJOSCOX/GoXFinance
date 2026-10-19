import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

let openDialogs = 0
let previousBodyOverflow = ''

export function Modal({
  title,
  onClose,
  children,
  className,
  framed = false,
  description,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  framed?: boolean
  description?: string
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (openDialogs++ === 0) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (
        document.querySelectorAll('[role="dialog"]')[
          document.querySelectorAll('[role="dialog"]').length - 1
        ] !== dialog.current
      )
        return
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0)
      if (!focusable.length) return
      if (
        event.shiftKey &&
        (document.activeElement === focusable[0] || document.activeElement === dialog.current)
      ) {
        event.preventDefault()
        focusable.at(-1)?.focus()
      }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
        event.preventDefault()
        focusable[0]?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (--openDialogs === 0) document.body.style.overflow = previousBodyOverflow
      previous?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'surface-card max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(90dvh,900px)] w-full max-w-lg rounded-2xl border border-white/10 bg-[#1b1d1c] shadow-2xl outline-none',
          framed ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto p-6',
          className,
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-4',
            framed
              ? 'border-b border-white/[.08] bg-white/[.015] px-5 py-4 sm:px-6 sm:py-5'
              : 'mb-5',
          )}
        >
          <div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-xs leading-5 text-[#90988f]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[.07] text-slate-400 hover:bg-white/5 hover:text-white"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
