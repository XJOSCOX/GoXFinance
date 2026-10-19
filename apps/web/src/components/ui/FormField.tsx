import { moneyText, parseMoney } from '../../lib/payment-money'
import {
  useEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { Input } from './index'

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-2 text-sm text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  )
}
export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full min-w-0 rounded-lg border border-white/12 bg-[#151716] px-3 text-sm outline-none focus:border-[#a9b8a9] ${className}`}
    />
  )
}
export function MoneyField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  required?: boolean
}) {
  const id = useId()
  const [text, setText] = useState(() => moneyText(value))
  const lastNotified = useRef(value)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (value !== lastNotified.current) {
      lastNotified.current = value
      setText(moneyText(value))
      input.current?.setCustomValidity('')
    }
  }, [value])
  return (
    <FormField label={label}>
      <Input
        id={id}
        ref={input}
        inputMode="decimal"
        pattern="[0-9]+(\.[0-9]{1,2})?"
        required={required}
        placeholder="Unknown"
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          try {
            const parsed = parseMoney(next)
            if (required && parsed === 0) throw new Error('Enter an amount greater than zero')
            event.target.setCustomValidity('')
            lastNotified.current = parsed
            onChange(parsed)
          } catch (failure) {
            event.target.setCustomValidity(
              failure instanceof Error ? failure.message : 'Enter a valid amount',
            )
          }
        }}
      />
    </FormField>
  )
}
