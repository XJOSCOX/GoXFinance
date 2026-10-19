import { Moon } from 'lucide-react'
import { Card } from '../../../components/ui'

export function EmptyDashboard() {
  return <Card className="dashboard-hero flex min-h-[310px] flex-col items-center justify-center p-8 text-center">
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/5"><Moon size={25} className="text-[#adbcad]"/></div>
    <h2 className="text-xl font-semibold">A clean place to begin</h2>
    <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">Nothing to show yet.</p>
  </Card>
}
