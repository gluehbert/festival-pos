import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems } from '../db/schema'
import { productionLanes, stationBuzzers } from '../db/schema-service'
import { LANE_ROUND_MS, productionCards, type ProductionLane, type ProductionQueueItem, type Station, type StationBuzzers } from './contracts/production'

// One lane per buzzer the admin set for the station, in lane order.
export async function activeLanes(db: Db, eventId: string, station: Station): Promise<Array<{ lane: number; key: string }>> {
  return await db.select({ lane: stationBuzzers.lane, key: stationBuzzers.key }).from(stationBuzzers)
    .where(and(eq(stationBuzzers.eventId, eventId), eq(stationBuzzers.station, station)))
    .orderBy(asc(stationBuzzers.lane))
}

// The buzzer keys of each station, in lane order (admin settings).
export async function loadStationBuzzers(db: Db, eventId: string): Promise<StationBuzzers> {
  const rows = await db.select().from(stationBuzzers).where(eq(stationBuzzers.eventId, eventId)).orderBy(asc(stationBuzzers.lane))
  const of = (station: Station) => rows.filter((r) => r.station === station).map((r) => r.key)
  return { kitchen: of('kitchen'), bar: of('bar') }
}

// Keeps each lane on its card while the card has open items and gives free
// lanes the oldest card no lane holds. Runs on every queue poll, so a lane
// refills as soon as its card is finished (by buzzer or by tap) or a new
// order comes in. Cards in a lane count as "in preparation" for the guest.
// `items` is the open queue, oldest first; it is updated in place.
export async function fillLanes(
  db: Db,
  eventId: string,
  station: Station,
  lanes: Array<{ lane: number; key: string }>,
  items: ProductionQueueItem[],
): Promise<ProductionLane[]> {
  const here = and(eq(productionLanes.eventId, eventId), eq(productionLanes.station, station))
  const rows = await db.select().from(productionLanes).where(here)
  if (lanes.length === 0 && rows.length === 0) return []

  const cards = productionCards(items, LANE_ROUND_MS)
  const open = cards.map((c) => c.key)
  const held = new Map<number, { groupKey: string; assignedAt: Date }>()
  for (const r of rows) {
    if (lanes.some((l) => l.lane === r.lane) && open.includes(r.groupKey)) held.set(r.lane, r)
    else await db.delete(productionLanes).where(and(here, eq(productionLanes.lane, r.lane), eq(productionLanes.groupKey, r.groupKey)))
  }

  for (const { lane } of lanes) {
    if (held.has(lane)) continue
    const taken = [...held.values()].map((h) => h.groupKey)
    const next = open.find((k) => !taken.includes(k))
    if (!next) break
    // Another screen may fill the same lane at the same time: whoever wins holds it.
    const won = (await db.insert(productionLanes).values({ eventId, station, lane, groupKey: next }).onConflictDoNothing().returning())[0]
      ?? (await db.select().from(productionLanes).where(and(here, eq(productionLanes.lane, lane))))[0]
    if (won) held.set(lane, won)
  }

  const inLanes = new Set([...held.values()].map((h) => h.groupKey))
  const started = cards.filter((c) => inLanes.has(c.key)).flatMap((c) => c.items).filter((i) => i.productionStatus === 'pending')
  if (started.length > 0) {
    await db.update(orderItems).set({ productionStatus: 'in_progress' }).where(and(
      inArray(orderItems.id, started.map((i) => i.orderItemId)),
      eq(orderItems.productionStatus, 'pending'),
    ))
    for (const i of started) i.productionStatus = 'in_progress'
  }
  return lanes.map(({ lane, key }) => {
    const h = held.get(lane)
    return { lane, key, groupKey: h?.groupKey ?? null, assignedAt: h ? new Date(h.assignedAt).toISOString() : null }
  })
}
