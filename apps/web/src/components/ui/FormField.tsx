import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'
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
  return (
    <FormField label={label}>
      <Input
        id={id}
        type="number"
        min={required ? '.01' : '0'}
        step=".01"
        required={required}
        placeholder="Unknown"
        value={value === null ? '' : value / 100}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Math.round(Number(event.target.value) * 100))
        }
      />
    </FormField>
  )
}
