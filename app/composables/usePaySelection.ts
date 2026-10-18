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

// Spreads the chosen count per group over its order lines: "2 Bier" from
// lines of 1 and 3 becomes the whole first line plus 1 of the second.
export function buildPayRequest(groups: PayGroup[], counts: Record<string, number>): PayRequest {
  const orderItemIds: string[] = []
  const quantities: Record<string, number> = {}
  for (const g of groups) {
    let left = Math.min(counts[g.key] ?? 0, g.openQuantity)
    for (const line of g.lines) {
      if (left <= 0) break
      const take = Math.min(left, line.quantity)
      orderItemIds.push(line.orderItemId)
      quantities[line.orderItemId] = take
      left -= take
    }
  }
  return { orderItemIds, quantities }
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
