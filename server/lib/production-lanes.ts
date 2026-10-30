import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems } from '../db/schema'
import { productionLanes } from '../db/schema-service'
import { productionGroupKey, type ProductionLane, type ProductionQueueItem, type Station } from './contracts/production'

// One lane per buzzer key the admin set: lane 1 (green), lane 2 (blue).
export function activeLanes(ev: { buzzerKey: string | null; buzzerKey2: string | null }): Array<{ lane: number; key: string }> {
  return [{ lane: 1, key: ev.buzzerKey }, { lane: 2, key: ev.buzzerKey2 }]
    .filter((l): l is { lane: number; key: string } => l.key !== null)
}

// Keeps each lane on its card while the card has open items and gives free
// lanes the oldest card no lane holds. Runs on every queue poll, so a lane
// refills as soon as its card is finished (by buzzer or by tap) or a new
// order comes in. A newly taken card counts as "in preparation" for the
// guest. `items` is the open queue, oldest first; it is updated in place.
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

  const open = [...new Set(items.map(productionGroupKey))]
  const held = new Map<number, string>()
  for (const r of rows) {
    if (lanes.some((l) => l.lane === r.lane) && open.includes(r.groupKey)) held.set(r.lane, r.groupKey)
    else await db.delete(productionLanes).where(and(here, eq(productionLanes.lane, r.lane), eq(productionLanes.groupKey, r.groupKey)))
  }

  for (const { lane } of lanes) {
    if (held.has(lane)) continue
    const next = open.find((k) => ![...held.values()].includes(k))
    if (!next) break
    // Another screen may fill the same lane at the same time: whoever wins holds it.
    const won = await db.insert(productionLanes).values({ eventId, station, lane, groupKey: next }).onConflictDoNothing().returning()
    if (won.length === 0) {
      const now = (await db.select().from(productionLanes).where(and(here, eq(productionLanes.lane, lane))))[0]
      if (now) held.set(lane, now.groupKey)
      continue
    }
    held.set(lane, next)
    const started = items.filter((i) => productionGroupKey(i) === next && i.productionStatus === 'pending')
    if (started.length === 0) continue
    await db.update(orderItems).set({ productionStatus: 'in_progress' }).where(and(
      inArray(orderItems.id, started.map((i) => i.orderItemId)),
      eq(orderItems.productionStatus, 'pending'),
    ))
    for (const i of started) i.productionStatus = 'in_progress'
  }
  return lanes.map(({ lane, key }) => ({ lane, key, groupKey: held.get(lane) ?? null }))
}
