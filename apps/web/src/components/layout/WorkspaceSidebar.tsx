import {
  Wallet,
  Landmark,
  Inbox,
  FileText,
  PieChart,
  TrendingUp,
  Target,
  CreditCard,
  Home,
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { HouseholdSummary } from '@goxfinance/shared'
import { Brand } from './Brand'
import { useHousehold } from '../../features/households/hooks/useHousehold'

export function WorkspaceSidebar({
  open,
  close,
  household,
}: {
  open: boolean
  close: () => void
  household: HouseholdSummary
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { households, select } = useHousehold()
  const navigation = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: `/households/${household.id}/bank-accounts`, label: 'Bank accounts', icon: Landmark },
    { href: `/households/${household.id}/transactions`, label: 'Transactions', icon: Inbox },
    { href: `/households/${household.id}/members`, label: 'Household', icon: Users },
    { href: `/households/${household.id}/debts`, label: 'Debts', icon: CreditCard },
    { href: `/households/${household.id}/debt-planning`, label: 'Debt planning', icon: Target },
    {
      href: `/households/${household.id}/forecasts`,
      label: 'Cash flow forecast',
      icon: TrendingUp,
    },
    { href: `/households/${household.id}/bills`, label: 'Bills', icon: Receipt },
    { href: `/households/${household.id}/income`, label: 'Income', icon: Wallet },
    { href: `/households/${household.id}/expenses`, label: 'Expenses', icon: ShoppingBag },
    { href: `/households/${household.id}/trading`, label: 'Trading', icon: TrendingUp },
    { href: `/households/${household.id}/budgets`, label: 'Budgets', icon: PieChart },
    { href: `/households/${household.id}/assets`, label: 'Assets & net worth', icon: Home },
    { href: `/households/${household.id}/goals`, label: 'Goals', icon: Target },
    { href: `/households/${household.id}/reports`, label: 'Reports', icon: FileText },
  ]
  return (
    <>
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-30 w-[216px] flex flex-col border-r border-white/10 p-4 transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button className="md:hidden" aria-label="Close navigation" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-xs text-slate-300">
          <Home size={15} className="shrink-0 text-[#adbcad]" />
          {households.length > 1 ? (
            <select
              aria-label="Current household"
              className="min-w-0 flex-1 bg-transparent outline-none"
              value={household.id}
              onChange={(event) => {
                select(event.target.value)
                navigate(`/households/${event.target.value}/members`)
                close()
              }}
            >
              {households.map((item) => (
                <option key={item.id} value={item.id} className="bg-[#151716]">
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate">{household.name}</span>
          )}
        </div>
        <nav
          aria-label="Workspace navigation"
          className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        >
          {[
            { label: 'Workspace', items: ['Overview', 'Household'] },
            {
              label: 'Everyday money',
              items: ['Bank accounts', 'Transactions', 'Income', 'Bills', 'Expenses'],
            },
            {
              label: 'Plan & build',
              items: [
                'Budgets',
                'Debts',
                'Debt planning',
                'Cash flow forecast',
                'Assets & net worth',
                'Goals',
              ],
            },
            { label: 'Activity & insights', items: ['Trading', 'Reports'] },
          ].map((group) => (
            <section key={group.label} className="mb-4">
              <h2 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[.13em] text-slate-500">
                {group.label}
              </h2>
              {group.items
                .map((label) => navigation.find((item) => item.label === label)!)
                .map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={close}
                      aria-current={active ? 'page' : undefined}
                      className={`my-0.5 flex min-h-10 w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#adbcad] ${active ? 'border-[#aab9aa] bg-white/[.07] font-medium text-[#e9ebe7]' : 'border-transparent text-slate-400 hover:bg-white/[.04] hover:text-white'}`}
                    >
                      <item.icon
                        size={16}
                        className={active ? 'shrink-0 text-[#adbcad]' : 'shrink-0'}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
            </section>
          ))}
        </nav>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          aria-label="Close navigation overlay"
          onClick={close}
        />
      )}
    </>
  )
}
