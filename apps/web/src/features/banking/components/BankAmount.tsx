export function BankAmount({ cents, currency }: { cents: number | null; currency: string | null }) {
  if (cents === null) return <>Unknown</>
  return (
    <>
      {currency
        ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
        : (cents / 100).toFixed(2) + ' · currency unknown'}
    </>
  )
}
