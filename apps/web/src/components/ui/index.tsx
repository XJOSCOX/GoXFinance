import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonStyles = cva('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8b6a8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151615] disabled:cursor-not-allowed disabled:opacity-45', {
  variants: { variant: {
    primary: 'border-[#b1beb0] bg-[#b1beb0] text-[#171a17] hover:border-[#c5d0c4] hover:bg-[#c5d0c4]',
    secondary: 'border-white/12 bg-white/[.055] text-[#e9eae7] hover:border-white/25 hover:bg-white/[.09]',
    ghost: 'border-transparent bg-transparent text-[#b5b9b4] hover:bg-white/[.07] hover:text-white',
  }, size: { default: '', small: 'min-h-8 px-3 py-1 text-xs' } }, defaultVariants: { variant: 'secondary', size: 'default' },
})
export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) { return <button data-variant={variant ?? 'secondary'} className={cn(buttonStyles({ variant, size }), className)} {...props}/> }
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cn('surface-card rounded-xl border border-white/[.09] bg-[#1b1d1c] shadow-[0_12px_30px_-24px_rgba(0,0,0,.8)]', className)}>{children}</div> }
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cn('h-10 w-full rounded-lg border border-white/[.12] bg-[#151716] px-3 text-sm text-[#edecea] outline-none transition-colors placeholder:text-[#737a75] focus:border-[#a9b8a9]', props.className)}/> }
