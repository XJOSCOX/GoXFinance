import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function OverviewDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/[.07]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-white/[.06] p-3">{children}</div>
    </details>
  )
}
