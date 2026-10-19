import { BarChart3 } from 'lucide-react'

export function Brand() {
  return <div className="flex items-center gap-3">
    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5"><BarChart3 size={18} className="text-[#adbcad]"/></div>
    <div><div className="text-sm font-semibold tracking-tight">GoXFinance</div><div className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-500">Household finance</div></div>
  </div>
}
