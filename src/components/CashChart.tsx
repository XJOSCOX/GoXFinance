import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usd } from '../lib/utils'

export default function CashChart({ data }: { data: { month: number; cumulative: number }[] }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}><defs><linearGradient id="cash" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#9cad9d" stopOpacity={0.28}/><stop offset="95%" stopColor="#9cad9d" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#363b36" strokeDasharray="2 5" vertical={false}/><XAxis dataKey="month" tickFormatter={v => `M${v}`} axisLine={false} tickLine={false} tick={{ fill: '#858d85', fontSize: 11 }} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858d85', fontSize: 11 }} tickFormatter={v => `$${Math.round(v / 1000)}k`}/><Tooltip formatter={v => usd(Number(v))} contentStyle={{ background: '#202321', border: '1px solid #454b45', borderRadius: 8, color: '#ededeb' }}/><Area type="monotone" dataKey="cumulative" stroke="#afc0af" strokeWidth={2.5} fill="url(#cash)"/></AreaChart></ResponsiveContainer>
}
