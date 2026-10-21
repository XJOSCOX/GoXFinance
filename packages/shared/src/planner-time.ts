const formatters = new Map<string, Intl.DateTimeFormat>()
/** Convert a wall-clock entry in an explicit IANA zone; never silently use the browser's zone. */
export function plannerLocalTimestamp(value: string, zone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw new Error('Enter a valid balance date and time.')
  const normalized = value.length === 16 ? value + ':00' : value,
    wall = Date.parse(normalized + 'Z')
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 19) !== normalized)
    throw new Error('Enter a valid balance date and time.')
  let formatter = formatters.get(zone)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
      formatters.set(zone, formatter)
    } catch {
      throw new Error('Select a valid IANA time zone.')
    }
  }
  const matches: number[] = []
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = wall - offset * 60000,
      parts = Object.fromEntries(
        formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
      )
    if (
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` ===
      normalized
    )
      matches.push(instant)
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'This time occurs twice during the clock change. Enter the equivalent UTC time using the UTC zone.'
        : 'This time does not exist in the selected time zone. Check the clock-change date.',
    )
  return new Date(matches[0]).toISOString()
}
