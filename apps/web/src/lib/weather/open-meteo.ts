import 'server-only'

/**
 * Weather, for the departure plan's rain buffer.
 *
 * Open-Meteo is used because it needs no key, no billing and no quota — the
 * same reason OpenStreetMap is used for tiles. A failure here degrades to "no
 * weather adjustment", never to "no plan": a student still needs to know when
 * to leave when the forecast service is down.
 */

const TUP_LAT = 14.5876
const TUP_LNG = 120.9847
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

export interface HourlyPrecipitation {
  /** `HH:MM` in Manila time. */
  hour: string
  probabilityPct: number
}

export async function precipitationForDate(date: string): Promise<HourlyPrecipitation[]> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('latitude', String(TUP_LAT))
  url.searchParams.set('longitude', String(TUP_LNG))
  url.searchParams.set('hourly', 'precipitation_probability')
  url.searchParams.set('timezone', 'Asia/Manila')
  url.searchParams.set('start_date', date)
  url.searchParams.set('end_date', date)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // An hour is well inside the useful life of a same-day forecast and keeps
      // us far below any rate limit.
      next: { revalidate: 3600 },
    })
    if (!response.ok) return []

    const body = (await response.json()) as {
      hourly?: { time?: string[]; precipitation_probability?: (number | null)[] }
    }

    const times = body.hourly?.time ?? []
    const values = body.hourly?.precipitation_probability ?? []

    return times.map((time, index) => ({
      hour: time.slice(11, 16),
      probabilityPct: values[index] ?? 0,
    }))
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * The worst hour inside the projected travel window. A 70% chance at 6 AM
 * matters to someone leaving at 5:40; the same figure at noon does not.
 */
export function worstInWindow(
  hours: readonly HourlyPrecipitation[],
  fromHour: string,
  toHour: string,
): HourlyPrecipitation | null {
  const within = hours.filter((entry) => entry.hour >= fromHour && entry.hour <= toHour)
  if (within.length === 0) return null
  return within.reduce((worst, entry) =>
    entry.probabilityPct > worst.probabilityPct ? entry : worst,
  )
}
