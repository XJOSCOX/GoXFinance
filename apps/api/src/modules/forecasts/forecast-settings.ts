import {
  availableCashAccounts,
  selectedOpeningTotal,
  confirmedForecastActivity,
  type OpeningCash,
  type ForecastSources,
  type ForecastSettingsVersion,
} from '@goxfinance/shared'
import { FinancialError } from '../households/financial-access'
export function visibleForecastSettings(
  value: ForecastSettingsVersion | null,
  data: ForecastSources,
): ForecastSettingsVersion | null {
  if (!value) return null
  const ids = new Set(data.cashAccounts?.map((a) => a.id))
  const visibleActivity = new Set(confirmedForecastActivity(data, '9999-12-31').map((a) => a.id))
  const opening =
    value.opening?.source === 'selected_accounts' &&
    value.opening.accounts.some((a) => !ids.has(a.accountId))
      ? null
      : value.opening
  return {
    id: value.id,
    revision: value.revision,
    createdAt: value.createdAt,
    opening: opening
      ? {
          ...opening,
          includedActivityIds: opening.includedActivityIds.filter((id) => visibleActivity.has(id)),
        }
      : null,
    bufferCents: value.bufferCents,
  }
}
export function validateOpeningCash(
  opening: OpeningCash | null,
  data: ForecastSources,
  now: string,
) {
  if (!opening) return
  if (Date.parse(opening.effectiveAt) > Date.parse(now))
    throw new FinancialError(
      'Opening cash must be confirmed for an effective time that has already occurred.',
      400,
    )
  if (opening.source === 'selected_accounts') {
    const eligible = availableCashAccounts(data, now),
      assetIds = new Set<string>()
    for (const selected of opening.accounts) {
      const a = eligible.find((a) => a.id === selected.accountId)
      if (
        !a ||
        a.balance!.id !== selected.balanceId ||
        a.balance!.availableCents !== selected.availableCents
      )
        throw new FinancialError(
          'Selected cash balance is unavailable, stale, private or changed. Refresh and confirm current available cash.',
          409,
        )
      if (a.assetId) {
        if (assetIds.has(a.assetId))
          throw new FinancialError(
            'Selected accounts overlap the same recorded asset. Confirm nonoverlapping cash instead.',
            400,
          )
        assetIds.add(a.assetId)
      }
    }
    if (selectedOpeningTotal(opening.accounts) !== opening.amountCents)
      throw new FinancialError('Opening cash must equal the selected available balances.', 400)
  }
}
