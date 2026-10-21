import { useEffect, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
export type MenuAction = { label: string; onSelect: () => void; disabled?: boolean }
export function ActionMenu({ label, items }: { label: string; items: MenuAction[] }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && ref.current) ref.current.open = false
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return (
    <details
      ref={ref}
      className="relative shrink-0"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && ref.current) {
          ref.current.open = false
          ref.current.querySelector('summary')?.focus()
        }
      }}
    >
      <summary
        aria-label={label}
        className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9b8a9] [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={19} aria-hidden="true" />
      </summary>
      <div
        className="absolute right-0 top-full z-30 mt-1 min-w-52 rounded-xl border border-white/10 bg-[#222522] p-1.5 shadow-xl"
        role="group"
        aria-label={label + ' options'}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9b8a9] disabled:opacity-40"
            onClick={() => {
              if (ref.current) ref.current.open = false
              item.onSelect()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  )
}
