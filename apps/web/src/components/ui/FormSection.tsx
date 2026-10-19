import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function FormSection({
  title,
  description,
  children,
  collapsible = false,
}: {
  title: string
  description?: string
  children: ReactNode
  collapsible?: boolean
}) {
  const id = useId()
  const heading = (
    <div className="min-w-0">
      <h3 id={id} className="text-sm font-semibold text-[#e8e9e6]">
        {title}
      </h3>
      {description && <p className="mt-1 text-xs leading-5 text-[#90988f]">{description}</p>}
    </div>
  )
  if (collapsible)
    return (
      <details className="group rounded-xl border border-white/[.08] bg-black/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline focus-visible:outline-[#b1beb0] [&::-webkit-details-marker]:hidden">
          {heading}
          <ChevronDown
            size={16}
            className="shrink-0 text-[#90988f] transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-4 border-t border-white/[.07] p-4">{children}</div>
      </details>
    )
  return (
    <section aria-labelledby={id} className="space-y-4">
      {heading}
      {children}
    </section>
  )
}
