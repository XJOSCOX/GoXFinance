import { useId } from 'react'
import type { PaymentAmountOption } from '@goxfinance/shared'
import { formatMoney } from '../../lib/money'
export function PaymentAmountSelector({
  options,
  selected,
  onSelect,
}: {
  options: PaymentAmountOption[]
  selected: string
  onSelect: (option: PaymentAmountOption) => void
}) {
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium">Payment type</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.id}
            className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${option.disabled ? 'border-white/5 opacity-50' : selected === option.id ? 'border-[#aab9aa] bg-white/5' : 'border-white/10'}`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={selected === option.id}
              disabled={option.disabled}
              onChange={() => onSelect(option)}
              className="mt-1 accent-[#b1beb0]"
            />
            <span>
              <span className="block">{option.label}</span>
              {option.id !== 'custom' && (
                <span className="mt-1 block text-xs text-slate-400">
                  {formatMoney(option.amountCents)}
                  {option.amountCents === 0 ? ' · Nothing due' : ''}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      {options.find((option) => option.id === selected)?.warning && (
        <p className="mt-3 text-sm text-amber-200">
          {options.find((option) => option.id === selected)?.warning}
        </p>
      )}
    </fieldset>
  )
}
