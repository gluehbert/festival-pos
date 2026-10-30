import type { TicketDetailItem } from '~/../server/lib/contracts/staff'

// One row on the cash screen: all open lines of the same article, price,
// Pfand and note, e.g. "Radler" ordered three times by guests and once by
// the waiter. unitPriceCents is what one unit costs, Pfand included.
export interface PayGroup {
  key: string
  sample: TicketDetailItem
  unitPriceCents: number
  openQuantity: number
  // Oldest first, so the earliest order is settled first.
  lines: TicketDetailItem[]
}

export interface PayRequest {
  orderItemIds: string[]
  quantities: Record<string, number>
}

export function groupOpenItems(items: TicketDetailItem[]): PayGroup[] {
  const groups = new Map<string, PayGroup>()
  for (const item of items) {
    if (item.paymentStatus !== 'unpaid' || item.productionStatus === 'cancelled') continue
    const deposit = item.depositCents ?? 0
    const key = `${item.menuItemId}:${item.unitPriceCents}:${deposit}:${item.note ?? ''}`
    let g = groups.get(key)
    if (!g) {
      g = { key, sample: item, unitPriceCents: item.unitPriceCents + deposit, openQuantity: 0, lines: [] }
      groups.set(key, g)
    }
    g.openQuantity += item.quantity
    g.lines.push(item)
  }
  for (const g of groups.values()) g.lines.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return Array.from(groups.values())
}

// Food prepay: "Essen kassieren" selects only the food; drinks are paid when brought.
export function foodCounts(groups: PayGroup[]): Record<string, number> {
  return Object.fromEntries(groups.filter((g) => g.sample.station === 'kitchen').map((g) => [g.key, g.openQuantity]))
}

// Spreads the chosen count per group over its order lines: "2 Bier" from
// lines of 1 and 3 becomes the whole first line plus 1 of the second.
// Lines of the chosen orders go first, so a guest picked by order number
// pays exactly the lines of that order.
export function buildPayRequest(groups: PayGroup[], counts: Record<string, number>, chosenOrders: ReadonlySet<string> = new Set()): PayRequest {
  const orderItemIds: string[] = []
  const quantities: Record<string, number> = {}
  for (const g of groups) {
    let left = Math.min(counts[g.key] ?? 0, g.openQuantity)
    const lines = [...g.lines.filter((l) => chosenOrders.has(l.orderId)), ...g.lines.filter((l) => !chosenOrders.has(l.orderId))]
    for (const line of lines) {
      if (left <= 0) break
      const take = Math.min(left, line.quantity)
      orderItemIds.push(line.orderItemId)
      quantities[line.orderItemId] = take
      left -= take
    }
  }
  return { orderItemIds, quantities }
}

// One order with open items, for "pay by order": several groups at one
// table pay what they ordered. Oldest first.
export interface OpenOrder {
  orderId: string
  orderedAt: string
  lines: TicketDetailItem[]
  openCents: number
}

export function openOrders(groups: PayGroup[]): OpenOrder[] {
  const byId = new Map<string, OpenOrder>()
  for (const g of groups) {
    for (const line of g.lines) {
      let o = byId.get(line.orderId)
      if (!o) {
        o = { orderId: line.orderId, orderedAt: line.createdAt, lines: [], openCents: 0 }
        byId.set(line.orderId, o)
      }
      if (line.createdAt < o.orderedAt) o.orderedAt = line.createdAt
      o.lines.push(line)
      o.openCents += g.unitPriceCents * line.quantity
    }
  }
  return [...byId.values()].sort((a, b) => a.orderedAt.localeCompare(b.orderedAt))
}

// The selection that pays exactly these orders.
export function countsForOrders(groups: PayGroup[], orderIds: ReadonlySet<string>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const g of groups) {
    const n = g.lines.reduce((sum, l) => sum + (orderIds.has(l.orderId) ? l.quantity : 0), 0)
    if (n > 0) counts[g.key] = n
  }
  return counts
}

export function selectionCents(groups: PayGroup[], counts: Record<string, number>): number {
  return groups.reduce((sum, g) => sum + g.unitPriceCents * Math.min(counts[g.key] ?? 0, g.openQuantity), 0)
}

// Seconds until another cashier's lock runs out, from the server's
// expiresAt. Capped, so a device with a wrong clock never counts for ages;
// an unreadable value falls back to the server's 60 s lock time.
export function lockSecondsLeft(expiresAt: string, now = Date.now()): number {
  const end = Date.parse(expiresAt)
  if (!Number.isFinite(end)) return 60
  return Math.min(300, Math.max(0, Math.ceil((end - now) / 1000)))
}

// i18n key for the lock hint: the own lock (a second tab) reads differently
// from a colleague's.
export function lockMessageKey(lockedBy: string, ownStaffId: string | undefined): string {
  return lockedBy === ownStaffId ? 'staff.pay.lockedSelf' : 'staff.pay.locked'
}
