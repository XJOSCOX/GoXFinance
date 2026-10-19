import { Link, Navigate } from 'react-router-dom'
import { Brand } from '../../../components/layout/Brand'
import { Button, Card, Input } from '../../../components/ui'
import { useAuthForm } from '../hooks/useAuthForm'

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { user, loading, fullName, setFullName, email, setEmail, password, setPassword,
    confirmPassword, setConfirmPassword, showPassword, setShowPassword, error, busy, submit } = useAuthForm(mode)

  if (loading) return <div className="app-shell min-h-screen" role="status">Loading workspace…</div>
  if (user) return <Navigate to="/dashboard" replace/>

  return <div className="app-shell grid min-h-screen place-items-center p-4">
    <Card className="w-full max-w-[460px] p-7 sm:p-9">
      <Brand/>
      <div className="mt-9">
        <h1 className="text-3xl font-semibold tracking-tight">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm text-slate-400">{mode === 'signup' ? 'Get started with GoXFinance.' : 'Sign in to your account.'}</p>
      </div>
      <form className="mt-8 space-y-4" onSubmit={submit}>
        {mode === 'signup' && <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Full name</span><Input autoComplete="name" required value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Your name"/></label>}
        <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Email</span><Input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></label>
        <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Password</span><div className="relative"><Input className="pr-16" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'At least 12 characters' : 'Your password'}/><button type="button" className="absolute inset-y-0 right-3 text-xs text-slate-400 hover:text-white" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
        {mode === 'signup' && <label className="block text-sm"><span className="mb-1.5 block text-slate-300">Confirm password</span><Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></label>}
        {error && <p role="alert" className="rounded-lg border border-[#b08985]/25 bg-[#b08985]/10 p-3 text-sm text-rose-300">{error}</p>}
        <Button className="w-full" type="submit" variant="primary" disabled={busy}>{busy ? mode === 'signup' ? 'Creating account…' : 'Signing in…' : mode === 'signup' ? 'Create account' : 'Log in'}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">{mode === 'signup' ? 'Already have an account?' : 'New to GoXFinance?'} <Link className="font-medium text-[#b7c7b5] underline-offset-4 hover:underline" to={mode === 'signup' ? '/login' : '/signup'}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Link></p>
    </Card>
  </div>
}
