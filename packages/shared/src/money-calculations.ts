// Integer-ratio rounding avoids binary floating-point multiplication of financial amounts.
export function roundCentsRatio(amount: number, numerator: number, denominator: number) {
  if (
    ![amount, numerator, denominator].every(Number.isSafeInteger) ||
    amount < 0 ||
    numerator < 0 ||
    denominator <= 0
  )
    throw new Error('Invalid financial ratio')
  const result = Number(
    (BigInt(amount) * BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator),
  )
  if (!Number.isSafeInteger(result)) throw new Error('Amount exceeds the supported range')
  return result
}
