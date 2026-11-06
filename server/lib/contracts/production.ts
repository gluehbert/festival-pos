import { z } from 'zod'

export const StationEnum = z.enum(['kitchen', 'bar', 'cafe'])
export type Station = z.infer<typeof StationEnum>

export const ProductionStatusEnum = z.enum(['pending', 'in_progress', 'done', 'cancelled'])
export type ProductionStatus = z.infer<typeof ProductionStatusEnum>

export const ProductionQueueQuerySchema = z.object({
  station: StationEnum.optional(),
})
export type ProductionQueueQuery = z.infer<typeof ProductionQueueQuerySchema>

export const ProductionQueueItemSchema = z.object({
  orderItemId: z.string().uuid(),
  orderId: z.string().uuid(),
  tableNo: z.number().int(),
  // 'walkin' is shown as counter sale instead of a table number.
  orderKind: z.enum(['guest', 'staff_table', 'walkin', 'staff_meal']),
  nameDe: z.string(),
  nameEn: z.string(),
  quantity: z.number().int(),
  note: z.string().nullable(),
  productionStatus: z.enum(['pending', 'in_progress']),
  orderedAt: z.string().datetime(),
})
export type ProductionQueueItem = z.infer<typeof ProductionQueueItemSchema>

// One card on the screen: all open items of a table at a station; counter
// sales and helper meals have no table and keep one card per order.
export function productionGroupKey(item: Pick<ProductionQueueItem, 'orderKind' | 'tableNo' | 'orderId'>): string {
  const atTable = item.orderKind === 'guest' || item.orderKind === 'staff_table'
  return atTable ? `table:${item.tableNo}` : `order:${item.orderId}`
}

// With buzzer lanes a later round of a table becomes a card of its own, so a
// buzzer never finishes what nobody has seen: only an order placed within
// this time after the card's first order joins the card.
export const LANE_ROUND_MS = 60_000

// The cards of the queue (items oldest first). Without `roundMs` all open
// items of a table form one card; with it, a later order starts a new one.
export function productionCards(
  items: readonly ProductionQueueItem[],
  roundMs?: number,
): Array<{ key: string; items: ProductionQueueItem[] }> {
  const cards: Array<{ key: string; start: number; items: ProductionQueueItem[] }> = []
  const latest = new Map<string, (typeof cards)[number]>()
  for (const item of items) {
    const base = productionGroupKey(item)
    const at = Date.parse(item.orderedAt)
    let card = latest.get(base)
    if (card && roundMs !== undefined && !card.items.some((i) => i.orderId === item.orderId) && at - card.start > roundMs) card = undefined
    if (!card) {
      card = { key: roundMs === undefined ? base : `${base}:${item.orderId}`, start: at, items: [] }
      cards.push(card)
      latest.set(base, card)
    }
    card.items.push(item)
  }
  return cards.map(({ key, items }) => ({ key, items }))
}

// Buzzers of a station: one-key keyboards (KeyboardEvent.key), each with its
// own lane on the station's screen, in list order (lane 1 green, 2 blue,
// 3 amber, 4 violet). More lanes would not fit next to "Next up".
export const BUZZERS_PER_STATION = 4

// Colours a lane can have; the first four are the lanes' defaults in order.
// A buzzer may take any of them, so its lane matches the buzzer's own colour.
export const LANE_COLOR_NAMES = ['green', 'blue', 'amber', 'violet', 'red', 'orange', 'pink', 'gray'] as const
export const LaneColorEnum = z.enum(LANE_COLOR_NAMES)
export type LaneColor = z.infer<typeof LaneColorEnum>

// Each lane's colour: the buzzer's own if it has one, otherwise the first
// default no other lane of the station uses.
export function laneColors(own: ReadonlyArray<LaneColor | null>, laneCount: number): LaneColor[] {
  const taken = new Set(own.slice(0, laneCount).filter((c): c is LaneColor => c !== null))
  return Array.from({ length: laneCount }, (_, i) => {
    const mine = own[i] ?? null
    if (mine) return mine
    const free = LANE_COLOR_NAMES.find((c) => !taken.has(c))!
    taken.add(free)
    return free
  })
}

const PerStation = <T extends z.ZodTypeAny>(t: T) => z.object({ kitchen: z.array(t), bar: z.array(t), cafe: z.array(t) })
export const StationBuzzersSchema = PerStation(z.string()).extend({ colors: PerStation(LaneColorEnum.nullable()) })
export type StationBuzzers = z.infer<typeof StationBuzzersSchema>
export const SetStationBuzzersSchema = z.object({
  station: StationEnum,
  keys: z.array(z.string().min(1).max(32)).max(BUZZERS_PER_STATION)
    .refine((keys) => new Set(keys).size === keys.length, 'Each buzzer needs its own key'),
  // One per key; missing ones take the lane's default colour.
  colors: z.array(LaneColorEnum.nullable()).max(BUZZERS_PER_STATION).optional()
    .refine((c) => !c || new Set(c.filter(Boolean)).size === c.filter(Boolean).length, 'Each buzzer needs its own colour'),
})
export type SetStationBuzzers = z.infer<typeof SetStationBuzzersSchema>

// Lanes of the station, one per person working side by side: the buzzer's
// key (null without a buzzer), the lane's colour, whether the lane pauses (takes no new card),
// the card the lane holds and since when (items ordered later are new to it).
export const ProductionLaneSchema = z.object({
  lane: z.number().int().min(1).max(BUZZERS_PER_STATION),
  key: z.string().nullable(),
  color: LaneColorEnum,
  paused: z.boolean(),
  groupKey: z.string().nullable(),
  assignedAt: z.string().datetime().nullable(),
})
export type ProductionLane = z.infer<typeof ProductionLaneSchema>

// The people at the station change their lanes: how many or one lane's pause. The admin names the station.
export const ProductionLanesPatchSchema = z.union([
  z.object({ station: StationEnum.optional(), laneCount: z.number().int().min(1).max(BUZZERS_PER_STATION) }),
  z.object({ station: StationEnum.optional(), lane: z.number().int().min(1).max(BUZZERS_PER_STATION), paused: z.boolean() }),
])
export type ProductionLanesPatch = z.infer<typeof ProductionLanesPatchSchema>
export const ProductionLanesSettingSchema = z.object({ laneCount: z.number().int().min(1).max(BUZZERS_PER_STATION), paused: z.array(z.number().int()) })
export type ProductionLanesSetting = z.infer<typeof ProductionLanesSettingSchema>

export const ProductionQueueSchema = z.object({
  station: StationEnum,
  items: z.array(ProductionQueueItemSchema),
  lanes: z.array(ProductionLaneSchema),
  // Lanes set at the station (at least one).
  laneCount: z.number().int().min(1).max(BUZZERS_PER_STATION),
  // Cafe counter closed: coffee and cake go to the kitchen (lib/cafe-routing.ts).
  cafeClosed: z.boolean(),
})
export type ProductionQueue = z.infer<typeof ProductionQueueSchema>

export const ProductionStatusPatchSchema = z.object({
  nextStatus: z.enum(['in_progress', 'done']),
})
export type ProductionStatusPatch = z.infer<typeof ProductionStatusPatchSchema>

// "Order complete": every open item of one order at one station at once.
export const ProductionOrderDoneSchema = z.object({
  station: StationEnum.optional(),
})
export type ProductionOrderDone = z.infer<typeof ProductionOrderDoneSchema>

// The cafe counter (or an admin) closes and reopens it.
export const CafeClosedSchema = z.object({ closed: z.boolean() })
export type CafeClosed = z.infer<typeof CafeClosedSchema>

export const ProductionOrderDoneResponseSchema = z.object({
  orderId: z.string().uuid(),
  doneItemIds: z.array(z.string().uuid()),
})
export type ProductionOrderDoneResponse = z.infer<typeof ProductionOrderDoneResponseSchema>

export const ProductionPatchResponseSchema = z.object({
  orderItemId: z.string().uuid(),
  productionStatus: ProductionStatusEnum,
})
export type ProductionPatchResponse = z.infer<typeof ProductionPatchResponseSchema>
