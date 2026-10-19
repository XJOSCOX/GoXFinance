import { z } from 'zod'

export const emailSchema = z.string().trim().pipe(z.email('Enter a valid email address')).transform(value => value.toLowerCase())

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your full name').max(120),
  email: emailSchema,
  password: z.string().min(12, 'Use at least 12 characters').max(128),
  confirmPassword: z.string(),
}).refine(value => value.password === value.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match',
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
})

export type PublicUser = { id: string; fullName: string; email: string }
export type AuthResponse = { user: PublicUser }
