import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { Brand } from '../components/Brand'
import { Button, Card, Input } from '../components/ui'
import { useAuth } from '../components/useAuth'
import { errorMessage, loginSchema, signupSchema } from '../lib/auth'

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { session, login, signup } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace/>

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const values = signupSchema.parse({ fullName, email, password, confirmPassword })
        await signup(values.fullName, values.email, values.password)
      } else {
        const values = loginSchema.parse({ email, password })
        await login(values.email, values.password)
      }
      setPassword('')
      setConfirmPassword('')
      navigate('/', { replace: true })
    } catch (failure) {
      setError(failure instanceof z.ZodError ? failure.issues[0]?.message ?? 'Check the form fields.' : errorMessage(failure))
    } finally { setBusy(false) }
  }

  return <div className="app-shell grid min-h-screen place-items-center p-4">
    <Card className="w-full max-w-[460px] p-7 sm:p-9">
      <Brand/>
      <div className="mt-9">
        <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Private workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm text-slate-400">{mode === 'signup' ? 'Your account stays on this device.' : 'Sign in to your local workspace.'}</p>
      </div>
      <form className="mt-8 space-y-4" onSubmit={submit}>
        {mode === 'signup' && <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Full name</span><Input autoComplete="name" required value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Your name"/></label>}
        <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Email</span><Input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></label>
        <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Password</span><div className="relative"><Input className="pr-16" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'At least 12 characters' : 'Your password'}/><button type="button" className="absolute inset-y-0 right-3 text-xs text-slate-400 hover:text-white" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
        {mode === 'signup' && <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Confirm password</span><Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></label>}
        {error && <p role="alert" className="rounded-lg border border-[#b08985]/25 bg-[#b08985]/10 p-3 text-sm text-rose-300">{error}</p>}
        <Button className="w-full" type="submit" variant="primary" disabled={busy}>{busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Log in'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">{mode === 'signup' ? 'Already have an account?' : 'New to GoXPlan?'} <Link className="font-medium text-[#b7c7b5] underline-offset-4 hover:underline" to={mode === 'signup' ? '/login' : '/signup'}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Link></p>
      <p className="mt-8 flex items-center justify-center gap-2 border-t border-white/10 pt-5 text-xs text-slate-500"><ShieldCheck size={14}/>Stored locally on this device</p>
    </Card>
  </div>
}
