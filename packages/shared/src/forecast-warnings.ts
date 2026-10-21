export type ForecastNotice = {
  severity: 'informational' | 'caution' | 'blocking'
  message: string
}

// Existing warnings remain strings in saved snapshots. New calculations carry
// explicit severity alongside them; unclassified warnings fail conservatively.
export class ForecastWarnings {
  readonly details: ForecastNotice[] = []
  push(...messages: string[]) {
    this.add('blocking', messages)
  }
  informational(...messages: string[]) {
    this.add('informational', messages)
  }
  caution(...messages: string[]) {
    this.add('caution', messages)
  }
  private add(severity: ForecastNotice['severity'], messages: string[]) {
    for (const message of messages)
      if (!this.details.some((n) => n.message === message && n.severity === severity))
        this.details.push({ severity, message })
  }
  get blocking() {
    return this.details.some((n) => n.severity === 'blocking')
  }
  get messages() {
    return [...new Set(this.details.map((n) => n.message))]
  }
}

export function forecastNotices(report: {
  warnings: string[]
  notices?: ForecastNotice[]
}): ForecastNotice[] {
  return report.notices ?? report.warnings.map((message) => ({ severity: 'blocking', message }))
}
