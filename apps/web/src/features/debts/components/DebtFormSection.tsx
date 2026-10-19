import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function DebtFormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <details className="group rounded-lg border border-white/[.07] bg-white/[.015]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-[#a9b8a9] [&::-webkit-details-marker]:hidden">
      <span><span className="block text-sm font-medium text-slate-300">{title}</span><span className="mt-0.5 block text-[11px] text-slate-500">{description}</span></span>
      <ChevronDown size={15} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"/>
    </summary>
    <div className="border-t border-white/[.06] p-4">{children}</div>
  </details>
}
