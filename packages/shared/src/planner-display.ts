const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const plannerMoney = (cents: number) => usd.format(cents / 100)
