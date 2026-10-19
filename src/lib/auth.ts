import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'

export const emailSchema = z.string().trim().pipe(z.email()).transform(value => value.toLowerCase())
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') })
export const signupSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your full name').max(120),
  email: emailSchema,
  password: z.string().min(12, 'Use at least 12 characters').max(128),
  confirmPassword: z.string(),
}).refine(value => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })

export type PublicUser = { id: string; fullName: string; email: string }
export type AuthSession = { token: string; user: PublicUser }

export const signUp = (fullName: string, email: string, password: string) => invoke<AuthSession>('signup', { fullName, email, password })
export const signIn = (email: string, password: string) => invoke<AuthSession>('login', { email, password })
export const currentUser = (token: string) => invoke<PublicUser>('current_user', { token })
export const signOut = (token: string) => invoke<void>('logout', { token })

export function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }
