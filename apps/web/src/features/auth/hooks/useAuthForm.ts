import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { invitationCodeSchema, loginSchema, signupSchema } from '@goxfinance/shared'
import { errorMessage } from '../api/authClient'
import { useAuth } from './useAuth'
import { useNotify } from '../../../components/ui/useNotify'

export function useAuthForm(mode: 'login' | 'signup') {
  const { user, loading, login, signup } = useAuth()
  const navigate = useNavigate()
  const notify = useNotify()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [signupPath, setSignupPath] = useState<'create' | 'join'>('create')
  const [invitationCode, setInvitationCode] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    setError('')
    setFieldErrors({})
    busyRef.current = true
    setBusy(true)
    try {
      if (mode === 'signup') {
        const values = signupSchema.parse({ fullName, email, password, confirmPassword,
          ...(signupPath === 'join' ? { invitationCode: invitationCodeSchema.parse(invitationCode) } : {}) })
        await signup(values.fullName, values.email, values.password, values.confirmPassword, values.invitationCode)
        if (signupPath === 'join') notify('success', 'Welcome to your household')
      } else {
        const values = loginSchema.parse({ email, password })
        await login(values.email, values.password)
      }
      setPassword('')
      setConfirmPassword('')
      navigate('/dashboard', { replace: true })
    } catch (failure) {
      if (failure instanceof z.ZodError) {
        const fields: Record<string, string> = {}
        for (const issue of failure.issues) fields[String(issue.path[0] ?? 'invitationCode')] ??= issue.message
        setFieldErrors(fields)
      } else { const message = errorMessage(failure); setError(message); notify('error', message) }
    } finally { busyRef.current = false; setBusy(false) }
  }

  return { user, loading, fullName, setFullName, email, setEmail, password, setPassword,
    confirmPassword, setConfirmPassword, showPassword, setShowPassword, signupPath, setSignupPath,
    invitationCode, setInvitationCode, fieldErrors, error, busy, submit }
}
