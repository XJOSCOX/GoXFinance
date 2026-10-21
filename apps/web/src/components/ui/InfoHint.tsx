import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert } from 'lucide-react'

/** Short explanations available with a pointer, keyboard, or touch, without expanding a row. */
export function InfoHint({ label, text }: { label: string; text: string }) {
  const id = useId(),
    button = useRef<HTMLButtonElement>(null),
    tip = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false),
    [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8, above: false })
  const open = hover || focus || pinned
  function close() {
    setHover(false)
    setFocus(false)
    setPinned(false)
  }
  function locate() {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const above = window.innerHeight - r.bottom < 180 && r.top > 180
    setPosition({
      left: Math.max(8, Math.min(r.right - 256, window.innerWidth - 264)),
      top: above ? r.top - 8 : r.bottom + 8,
      above,
    })
  }
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!button.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node))
        close()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9b8a9]"
        onPointerEnter={(e) => {
          if (e.pointerType !== 'touch') {
            locate()
            setHover(true)
          }
        }}
        onPointerLeave={() => setHover(false)}
        onFocus={() => {
          locate()
          setFocus(true)
        }}
        onBlur={() => setFocus(false)}
        onClick={() => {
          locate()
          if (pinned) close()
          else setPinned(true)
        }}
      >
        <CircleAlert size={13} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            className="fixed z-[100] max-h-[40vh] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-white/15 bg-[#252825] px-3 py-2 text-left text-xs font-normal leading-relaxed text-slate-200 shadow-xl"
            style={{
              left: position.left,
              top: position.top,
              transform: position.above ? 'translateY(-100%)' : undefined,
            }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
