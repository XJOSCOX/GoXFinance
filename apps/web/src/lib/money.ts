export function formatMoney(cents: number | null) {
  if (cents === null) return 'Unknown'
  const absolute = Math.abs(cents)
  const dollars = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    Math.trunc(absolute / 100),
  )
  return `${cents < 0 ? '-' : ''}$${dollars}.${String(absolute % 100).padStart(2, '0')}`
}
