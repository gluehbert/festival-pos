import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems } from '../db/schema'
import { productionLanes, stationBuzzers, stationLaneSettings } from '../db/schema-service'
import { LANE_ROUND_MS, productionCards, laneColors, type LaneColor, type ProductionLane, type ProductionLanesSetting, type ProductionQueueItem, type Station, type StationBuzzers } from './contracts/production'

export interface ActiveLane { lane: number; key: string | null; color: LaneColor; paused: boolean }

const pausedLanes = (mask: number) => [1, 2, 3, 4].filter((lane) => (mask & (1 << (lane - 1))) !== 0)

// How many lanes the station works with and which pause. Without a setting
// from the station: one lane per buzzer, at least one.
export async function laneSetting(db: Db, eventId: string, station: Station): Promise<ProductionLanesSetting & { keys: string[]; colors: Array<LaneColor | null> }> {
  const buzzers = await db.select({ key: stationBuzzers.key, color: stationBuzzers.color }).from(stationBuzzers)
    .where(and(eq(stationBuzzers.eventId, eventId), eq(stationBuzzers.station, station)))
    .orderBy(asc(stationBuzzers.lane))
  const keys = buzzers.map((r) => r.key)
  const row = (await db.select().from(stationLaneSettings)
    .where(and(eq(stationLaneSettings.eventId, eventId), eq(stationLaneSettings.station, station))))[0]
  const laneCount = row?.laneCount ?? Math.max(1, keys.length)
  const colors = buzzers.map((r) => (r.color as LaneColor | null) ?? null)
  return { laneCount, paused: pausedLanes(row?.pausedMask ?? 0).filter((l) => l <= laneCount), keys, colors }
}

// The lanes of the station's screen, in lane order, each with its buzzer if
// it has one. One lane without a buzzer is no lane: the plain cards show.
export async function activeLanes(db: Db, eventId: string, station: Station): Promise<{ laneCount: number; lanes: ActiveLane[] }> {
  const { laneCount, paused, keys, colors } = await laneSetting(db, eventId, station)
  if (laneCount === 1 && keys.length === 0) return { laneCount, lanes: [] }
  const color = laneColors(colors, laneCount)
  const lanes = Array.from({ length: laneCount }, (_, i) => ({ lane: i + 1, key: keys[i] ?? null, color: color[i]!, paused: paused.includes(i + 1) }))
  return { laneCount, lanes }
}

// Changes the station's lane count or one lane's pause. Fewer lanes drop
// the highest ones: their cards go back to "Next up" on the next poll.
export async function changeLanes(
  db: Db,
  eventId: string,
  station: Station,
  change: { laneCount: number } | { lane: number; paused: boolean },
): Promise<ProductionLanesSetting> {
  const now = await laneSetting(db, eventId, station)
  const laneCount = 'laneCount' in change ? change.laneCount : now.laneCount
  let paused = now.paused
  if ('lane' in change) paused = change.paused ? [...new Set([...paused, change.lane])] : paused.filter((l) => l !== change.lane)
  paused = paused.filter((l) => l <= laneCount).sort((a, b) => a - b)
  const pausedMask = paused.reduce((m, l) => m | (1 << (l - 1)), 0)
  await db.insert(stationLaneSettings).values({ eventId, station, laneCount, pausedMask })
    .onConflictDoUpdate({ target: [stationLaneSettings.eventId, stationLaneSettings.station], set: { laneCount, pausedMask } })
  return { laneCount, paused }
}

// The buzzer keys and colours of each station, in lane order (admin settings).
export async function loadStationBuzzers(db: Db, eventId: string): Promise<StationBuzzers> {
  const rows = await db.select().from(stationBuzzers).where(eq(stationBuzzers.eventId, eventId)).orderBy(asc(stationBuzzers.lane))
  const of = (station: Station) => rows.filter((r) => r.station === station)
  const keys = (station: Station) => of(station).map((r) => r.key)
  const colors = (station: Station) => of(station).map((r) => (r.color as LaneColor | null) ?? null)
  return {
    kitchen: keys('kitchen'), bar: keys('bar'), cafe: keys('cafe'),
    colors: { kitchen: colors('kitchen'), bar: colors('bar'), cafe: colors('cafe') },
  }
}

// Keeps each lane on its card while the card has open items and gives free
// lanes the oldest card no lane holds; a paused lane takes none. Runs on every queue poll, so a lane
// refills as soon as its card is finished (by buzzer or by tap) or a new
// order comes in. Cards in a lane count as "in preparation" for the guest.
// `items` is the open queue, oldest first; it is updated in place.
export async function fillLanes(
  db: Db,
  eventId: string,
  station: Station,
  lanes: ActiveLane[],
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

  for (const { lane, paused } of lanes) {
    if (held.has(lane) || paused) continue
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
  return lanes.map(({ lane, key, color, paused }) => {
    const h = held.get(lane)
    return { lane, key, color, paused, groupKey: h?.groupKey ?? null, assignedAt: h ? new Date(h.assignedAt).toISOString() : null }
  })
}
