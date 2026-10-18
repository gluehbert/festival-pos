import { useI18n } from '#imports'

// Locale-aware formatting for money (integer cents) and timestamps.
export function useFormat() {
  const { locale } = useI18n()
  const tag = () => (locale.value === 'en' ? 'en-IE' : 'de-DE')

  function euro(cents: number): string {
    return new Intl.NumberFormat(tag(), { style: 'currency', currency: 'EUR' }).format(cents / 100)
  }

  function dateTime(value: string | Date | null | undefined): string {
    if (!value) return '–'
    return new Date(value).toLocaleString(tag(), { dateStyle: 'short', timeStyle: 'short' })
  }

  // Report hour bucket: local wall clock without offset ("2026-07-04T18:00",
  // already Europe/Berlin), so it is shown as is, whatever the device zone.
  function hour(value: string): string {
    return new Date(`${value}:00Z`).toLocaleString(tag(), { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  }

  // Clock time with seconds, e.g. "18:42:07".
  function time(value: string | number | Date): string {
    return new Date(value).toLocaleTimeString(tag(), { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // Clock time where the event takes place, e.g. "18:00" (price rules run on Berlin time).
  function clock(value: string | Date): string {
    return new Date(value).toLocaleTimeString(tag(), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
  }

  // Event day(s), e.g. "Sa., 14. – So., 15. Juni 2026". Dates are calendar
  // days (YYYY-MM-DD), formatted in UTC so no time zone shifts the day.
  function eventDates(startsOn: string | null, endsOn: string | null): string | null {
    const first = startsOn ?? endsOn
    if (!first) return null
    const fmt = new Intl.DateTimeFormat(tag(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    const start = new Date(`${first}T00:00:00Z`)
    if (!startsOn || !endsOn || endsOn === startsOn) return fmt.format(start)
    return fmt.formatRange(start, new Date(`${endsOn}T00:00:00Z`))
  }

  // Name of a menu item in the current UI language.
  function itemName(item: { nameDe: string; nameEn: string }): string {
    return locale.value === 'en' ? item.nameEn : item.nameDe
  }

  return { euro, dateTime, hour, time, clock, eventDates, itemName }
}
