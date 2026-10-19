import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { loginSchema, signupSchema } from '@goxfinance/shared'
import { errorMessage } from '../api/authClient'
import { useAuth } from './useAuth'

export function useAuthForm(mode: 'login' | 'signup') {
  const { user, loading, login, signup } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const values = signupSchema.parse({ fullName, email, password, confirmPassword })
        await signup(values.fullName, values.email, values.password, values.confirmPassword)
      } else {
        const values = loginSchema.parse({ email, password })
        await login(values.email, values.password)
      }
      setPassword('')
      setConfirmPassword('')
      navigate('/dashboard', { replace: true })
    } catch (failure) {
      setError(failure instanceof z.ZodError ? failure.issues[0]?.message ?? 'Check the form fields.' : errorMessage(failure))
    } finally { setBusy(false) }
  }

  return { user, loading, fullName, setFullName, email, setEmail, password, setPassword,
    confirmPassword, setConfirmPassword, showPassword, setShowPassword, error, busy, submit }
}
