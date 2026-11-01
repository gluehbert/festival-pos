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

// Buzzer lanes (1 = green, 2 = blue) of the event: the buzzer's key, the
// card the lane holds and since when (items ordered later are new to it).
export const ProductionLaneSchema = z.object({
  lane: z.number().int().min(1).max(2),
  key: z.string(),
  groupKey: z.string().nullable(),
  assignedAt: z.string().datetime().nullable(),
})
export type ProductionLane = z.infer<typeof ProductionLaneSchema>

export const ProductionQueueSchema = z.object({
  station: StationEnum,
  items: z.array(ProductionQueueItemSchema),
  lanes: z.array(ProductionLaneSchema),
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
