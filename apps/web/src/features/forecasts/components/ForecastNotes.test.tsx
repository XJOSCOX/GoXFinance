// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { forecast } from '@goxfinance/shared'
import {
  smartInput,
  smartSources,
} from '../../../../../../packages/shared/src/smart-forecast.fixture'
import { ForecastNotes } from './ForecastNotes'

afterEach(cleanup)
it('shows informative and caution notes without calling a calculable forecast incomplete', () => {
  const report = forecast(smartSources(), smartInput(), '2026-10-20')
  render(<ForecastNotes report={report} />)
  expect(screen.getByText('Information')).toBeTruthy()
  expect(screen.queryByText('Missing / unresolved')).toBeNull()
  expect(screen.getByText(/Projection notes/).closest('details')?.open).toBe(false)
  expect(report.endingCents).toBe(100000)
})
it('opens unresolved legacy snapshot notes and preserves the explanation', () => {
  const report = forecast(smartSources(), smartInput(null), '2026-10-20')
  delete report.notices
  render(<ForecastNotes report={report} />)
  expect(screen.getByText('Missing / unresolved')).toBeTruthy()
  expect(screen.getByText(/Projection notes/).closest('details')?.open).toBe(true)
  expect(screen.getByText(/Opening cash balance required/)).toBeTruthy()
})
