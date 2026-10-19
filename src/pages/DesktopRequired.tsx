import { LockKeyhole } from 'lucide-react'
import { Brand } from '../components/Brand'
import { Card } from '../components/ui'

export function DesktopRequired() {
  return <div className="app-shell flex min-h-screen items-center justify-center p-5">
    <Card className="w-full max-w-md p-8">
      <Brand/>
      <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5"><LockKeyhole size={23} className="text-[#adbcad]"/></div>
      <h1 className="mt-5 text-2xl font-semibold">Desktop app required</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">GoXPlan stores accounts only in local SQLite. Open the Windows desktop application to sign up or log in.</p>
    </Card>
  </div>
}
