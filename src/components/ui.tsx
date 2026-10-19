import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

const buttonStyles = cva('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a8b6a8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151615] disabled:cursor-not-allowed disabled:opacity-45', {
  variants: {
    variant: {
      primary: 'border-[#b1beb0] bg-[#b1beb0] text-[#171a17] hover:border-[#c5d0c4] hover:bg-[#c5d0c4]',
      secondary: 'border-white/12 bg-white/[.055] text-[#e9eae7] hover:border-white/25 hover:bg-white/[.09]',
      ghost: 'border-transparent bg-transparent text-[#b5b9b4] hover:bg-white/[.07] hover:text-white',
      danger: 'border-[#765452]/40 bg-[#765452]/15 text-[#d9adaa] hover:bg-[#765452]/25',
    },
    size: { default: '', small: 'min-h-8 px-3 py-1 text-xs' },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
})

export function Button({ className, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button data-variant={variant ?? 'secondary'} className={cn(buttonStyles({ variant, size }), className)} {...props} />
}
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('surface-card rounded-xl border border-white/[.09] bg-[#1b1d1c] shadow-[0_12px_30px_-24px_rgba(0,0,0,.8)]', className)}>{children}</div>
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('h-10 w-full rounded-lg border border-white/[.12] bg-[#151716] px-3 text-sm text-[#edecea] outline-none transition-colors placeholder:text-[#737a75] focus:border-[#a9b8a9]', props.className)} />
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn('h-10 w-full rounded-lg border border-white/[.12] bg-[#151716] px-3 text-sm text-[#edecea] outline-none transition-colors focus:border-[#a9b8a9]', props.className)} />
}
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const colors = { neutral: 'border-white/10 bg-white/[.06] text-[#bfc1bd]', good: 'border-[#9dac9b]/25 bg-[#9dac9b]/10 text-[#b7c7b5]', warn: 'border-[#b4a790]/25 bg-[#b4a790]/10 text-[#c6bba6]', bad: 'border-[#b08985]/25 bg-[#b08985]/10 text-[#d5a9a4]' }
  return <span data-tone={tone} className={cn('inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium capitalize tracking-wide', colors[tone])}>{children}</span>
}
export function Modal({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-[3px]"/><Dialog.Content className="surface-card fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(94vw,650px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-white/15 bg-[#202220] p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4"><Dialog.Title className="text-xl font-semibold tracking-tight">{title}</Dialog.Title><Dialog.Close className="rounded-lg p-2 text-[#bfc1bd] hover:bg-white/10 hover:text-white" aria-label="Close"><X size={18}/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>
}
