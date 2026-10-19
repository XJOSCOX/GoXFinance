import type { Goal, GoalContribution, TradingData } from '@goxfinance/shared'
import { Button, Card } from '../../../components/ui'
import { formatMoney } from '../../../lib/money'
export function GoalCard({
  goal,
  contributions,
  trading,
  onEdit,
  onContribute,
  onAudit,
}: {
  goal: Goal
  contributions: GoalContribution[]
  trading: TradingData | null
  onEdit: () => void
  onContribute: (entry?: GoalContribution) => void
  onAudit: (id: string) => void
}) {
  const p = goal.progress,
    atMost = goal.direction === 'at_most',
    percent =
      p.actualCents === null || goal.targetCents === 0
        ? 0
        : Math.min(100, Math.max(0, (p.actualCents / goal.targetCents) * 100))
  return (
    <Card className="min-w-0 p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold">{goal.name}</h2>
          <p className="mt-1 text-xs capitalize text-slate-500">
            {goal.goalType.replaceAll('_', ' ')} / {goal.period} / {goal.status}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {goal.tradingAccountId
              ? trading?.accounts.find((a) => a.id === goal.tradingAccountId)?.nickname
              : goal.copyGroupId
                ? trading?.groups.find((g) => g.id === goal.copyGroupId)?.name
                : 'Member / household total'}
          </p>
        </div>
        <div className="flex items-start gap-1">
          {goal.canManage && (
            <Button size="small" onClick={onEdit}>
              Edit
            </Button>
          )}
          <Button size="small" variant="ghost" onClick={() => onAudit(goal.id)}>
            Audit
          </Button>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-400">
        {p.startDate} to {p.endDate}
        {goal.timezone ? ` / ${goal.timezone}, sessions start ${goal.sessionStart}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl font-semibold tabular-nums">
          {formatMoney(p.actualCents)}{' '}
          <span className="text-xs font-normal text-slate-500">
            / {formatMoney(goal.targetCents)}
          </span>
        </p>
        <span
          className={`text-xs ${p.incomplete ? 'text-amber-200/80' : p.met ? 'text-[#b1beb0]' : 'text-slate-400'}`}
        >
          {p.incomplete
            ? 'Incomplete source data'
            : p.met
              ? atMost
                ? 'Within limit so far'
                : 'Target met'
              : atMost
                ? 'Limit exceeded'
                : 'Target not met'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={goal.name + ' progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.actualCents === null ? undefined : percent}
        aria-valuetext={formatMoney(p.actualCents) + ' of ' + formatMoney(goal.targetCents)}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[.07]"
      >
        <div
          className={`h-full ${atMost && !p.met ? 'bg-[#b68b84]' : 'bg-[#a9b8a9]'}`}
          style={{ width: percent + '%' }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {atMost
          ? 'Overage: ' + formatMoney(p.overageCents)
          : 'Shortfall: ' + formatMoney(p.shortfallCents)}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{p.source}</p>
      {goal.canManage && ['savings', 'manual'].includes(goal.goalType) && (
        <Button size="small" className="mt-3" onClick={() => onContribute()}>
          Record contribution
        </Button>
      )}
      <details className="mt-4 border-t border-white/10 pt-3">
        <summary className="cursor-pointer text-xs text-slate-400">
          Period history &amp; contributions
        </summary>
        <div className="mt-3 space-y-2">
          {goal.history.map((h) => (
            <p key={h.startDate} className="flex flex-wrap justify-between gap-2 text-xs">
              <span>
                {h.startDate} - {h.endDate}
              </span>
              <span>
                {formatMoney(h.actualCents)} /{' '}
                {h.incomplete ? 'Incomplete' : h.met ? 'Met / within limit' : 'Not met'}
              </span>
            </p>
          ))}
          {contributions.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[.05] py-2 text-xs"
            >
              <span>
                {c.date} / {formatMoney(c.amountCents)} / {c.notes}
              </span>
              <div className="flex gap-1">
                {c.canManage && (
                  <Button size="small" onClick={() => onContribute(c)}>
                    Correct
                  </Button>
                )}
                <Button size="small" variant="ghost" onClick={() => onAudit(c.id)}>
                  Audit
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Last 12 anchored periods, using the current definition. {goal.notes}
        </p>
      </details>
    </Card>
  )
}
