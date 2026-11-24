import { and, eq, isNotNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems, orders } from '../db/schema'
import type { WaitTimeRow } from './contracts/reports'
import { REPORT_TIME_ZONE } from './reports'

// How long kitchen, bar and cafe took: from the order to "Fertig", per
// station. Median = the typical wait, p90 = what the slowest tenth of the
// guests waited. The busiest hour shows when it got tight. "Brought" is not
// measured: in the rush nobody taps "Gebracht", and paying marks items as
// brought, so that time says more about the bill than about the service.
// Rehearsal orders and cancelled items never count.

// An hour needs this many finished items before its median means anything.
export const PEAK_MIN_ITEMS = 5

const STATION_ORDER = ['kitchen', 'bar', 'cafe']

const hourFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

// "2026-07-04T18:00", the same local hour format as orders_per_hour.
export function localHourOf(at: Date): string {
  const p = Object.fromEntries(hourFormat.formatToParts(at).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`
}

// Nearest-rank percentile of sorted values.
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!
}

export async function loadWaitTimes(db: Db, eventId: string): Promise<WaitTimeRow[]> {
  const items = await db
    .select({ station: orderItems.station, createdAt: orderItems.createdAt, readyAt: orderItems.readyAt })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(
      eq(orders.eventId, eventId),
      eq(orders.isTrial, false),
      isNotNull(orderItems.readyAt),
      ne(orderItems.productionStatus, 'cancelled'),
    ))

  const byStation = new Map<string, { all: number[]; byHour: Map<string, number[]> }>()
  for (const item of items) {
    if (!item.readyAt) continue
    const created = new Date(item.createdAt)
    const seconds = (new Date(item.readyAt).getTime() - created.getTime()) / 1000
    if (!(seconds >= 0)) continue
    let s = byStation.get(item.station)
    if (!s) byStation.set(item.station, (s = { all: [], byHour: new Map() }))
    s.all.push(seconds)
    const hour = localHourOf(created)
    const list = s.byHour.get(hour)
    if (list) list.push(seconds)
    else s.byHour.set(hour, [seconds])
  }

  const rows: WaitTimeRow[] = []
  for (const [station, s] of byStation) {
    const all = s.all.sort((a, b) => a - b)
    let peakHour: string | null = null
    let peakMedian = -1
    for (const [hour, list] of s.byHour) {
      if (list.length < PEAK_MIN_ITEMS) continue
      const median = percentile(list.sort((a, b) => a - b), 50)
      if (median > peakMedian) {
        peakMedian = median
        peakHour = hour
      }
    }
    rows.push({
      station,
      itemCount: all.length,
      medianSeconds: Math.round(percentile(all, 50)),
      p90Seconds: Math.round(percentile(all, 90)),
      peakHour,
      peakHourMedianSeconds: peakHour ? Math.round(peakMedian) : null,
    })
  }
  const rank = (st: string) => (STATION_ORDER.includes(st) ? STATION_ORDER.indexOf(st) : STATION_ORDER.length)
  return rows.sort((a, b) => rank(a.station) - rank(b.station))
}
