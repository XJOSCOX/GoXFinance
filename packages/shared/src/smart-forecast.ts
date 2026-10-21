import { forecastInputSchema, type ForecastInput } from './forecasts'
import type { ForecastSettingsVersion } from './smart-forecast-settings'
import { forecastAddDays } from './smart-forecast-events'
export function smartForecastInput(
  settings: ForecastSettingsVersion | null | undefined,
  today: string,
  days = 30,
): ForecastInput {
  return forecastInputSchema.parse({
    name: 'Smart cash flow',
    startDate: today,
    endDate: forecastAddDays(today, days - 1),
    startingCents: settings?.opening?.amountCents ?? null,
    confidence: settings?.opening ? 'confirmed' : 'unverified',
    mode: 'expected',
    income: [],
    variableSpendingCents: 0,
    extraDebtCents: 0,
    includeSettlements: false,
    includeUncertainPayouts: false,
    oneTime: [],
    smart: {
      opening: settings?.opening ?? null,
      bufferCents: settings?.bufferCents ?? 0,
      settingsVersionId: settings?.id ?? null,
      incomeAdjustments: [],
      postponedPayments: [],
    },
  })
}
export {
  confirmedForecastActivity,
  availableCashAccounts,
  selectedOpeningTotal,
  forecastAddDays,
} from './smart-forecast-events'
