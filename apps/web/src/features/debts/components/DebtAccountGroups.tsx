import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Debt } from '@goxfinance/shared'
import { Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
import type { DebtGroup } from '../lib/debt-groups'
import { InfoHint } from '../../../components/ui/InfoHint'
import { toneStyles, statusTone } from '../../../components/ui/semantic-tones'

function balance(group: DebtGroup) {
  return formatMoney(
    group.obligationCount > 0 && group.unknownCount === group.obligationCount
      ? null
      : group.balanceCents,
  )
}

export function DebtAccountGroups({
  groups,
  archived,
  renderAccount,
}: {
  groups: DebtGroup[]
  archived: boolean
  renderAccount: (debt: Debt) => ReactNode
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  function setOpen(id: string, open: boolean) {
    setExpanded((current) => {
      const next = new Set(current)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Debt sections" className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              key={group.id}
              href={`#debts-${group.id}`}
              onClick={() => setOpen(group.id, true)}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 focus-visible:outline focus-visible:outline-[#a9b8a9]"
            >
              <span className={toneStyles[statusTone(group.id)].text}>{group.label}</span>
              <span className="text-slate-500">{group.debts.length}</span>
            </a>
          ))}
        </nav>
        <InfoHint
          label="Debt group totals"
          text={`${archived ? 'Archived' : 'Active'} accounts matching your filters. Known balances only; unknown balances are excluded. Verified duplicate links count once within a section.`}
        />
      </div>
      {groups.map((group) => (
        <Card
          key={group.id}
          id={`debts-${group.id}`}
          role="region"
          aria-label={group.label}
          className="scroll-mt-20"
        >
          <h2>
            <button
              type="button"
              aria-expanded={expanded.has(group.id)}
              aria-controls={`debts-${group.id}-accounts`}
              onClick={() => setOpen(group.id, !expanded.has(group.id))}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/[.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a9b8a9] sm:px-4"
            >
              <span className="min-w-0 flex-1">
                <span className={`font-semibold ${toneStyles[statusTone(group.id)].text}`}>
                  {group.label}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {group.debts.length}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-base font-semibold tabular-nums">{balance(group)}</span>
                <span className="block text-[11px] font-normal text-slate-500">
                  {group.unknownCount
                    ? `${group.unknownCount} unknown · known total`
                    : 'Total balance'}
                </span>
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={`shrink-0 text-slate-400 transition-transform ${expanded.has(group.id) ? 'rotate-180' : ''}`}
              />
            </button>
          </h2>
          <div
            id={`debts-${group.id}-accounts`}
            hidden={!expanded.has(group.id)}
            className="border-t border-white/[.08]"
          >
            {group.debts.length > 0 ? (
              <>
                <div
                  aria-hidden="true"
                  className="hidden grid-cols-12 gap-4 border-b border-white/[.07] bg-white/[.015] px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 lg:grid"
                >
                  <span className="col-span-4">Account</span>
                  <span className="col-span-2">Responsible</span>
                  <span className="col-span-2">Status</span>
                  <span className="col-span-2 text-right">Balance</span>
                  <span className="col-span-2 text-right">Actions</span>
                </div>
                {group.debts.map(renderAccount)}
              </>
            ) : (
              <p className="px-4 py-6 text-sm text-slate-500 sm:px-4">
                No matching {group.label.toLowerCase()}.
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
