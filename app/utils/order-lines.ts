import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import { NOTE_MAX_LENGTH } from '~/../server/lib/contracts/guest'

// A line in the guest cart or the waiter's pad. The same article can appear
// on several lines when they carry different notes ("1 × Burger without
// onions", "2 × Burger"); kitchen/bar get them as separate positions.
export interface OrderLine {
  key: string
  menuItem: MenuItemDto
  quantity: number
  note: string
}

const MAX_QTY = 50
let seq = 0
const nextKey = () => `l${++seq}`

// A line restored from storage (or saved before notes existed) gets a fresh
// key and a clean note.
export function restoreLine(menuItem: MenuItemDto, quantity: number, note: unknown): OrderLine {
  return { key: nextKey(), menuItem, quantity, note: typeof note === 'string' ? normalizeNote(note) : '' }
}

export function normalizeNote(note: string): string {
  return note.trim().slice(0, NOTE_MAX_LENGTH)
}

// The articles of these lines, each once.
export function uniqueItems(lines: readonly OrderLine[]): MenuItemDto[] {
  return [...new Map(lines.map((l) => [l.menuItem.id, l.menuItem])).values()]
}

// Tapping an article adds to its line without a note.
export function addItem(lines: OrderLine[], item: MenuItemDto): OrderLine[] {
  const line = lines.find((l) => l.menuItem.id === item.id && l.note === '')
  if (line) {
    line.quantity = Math.min(MAX_QTY, line.quantity + 1)
    return lines
  }
  return [...lines, { key: nextKey(), menuItem: item, quantity: 1, note: '' }]
}

export function setLineQty(lines: OrderLine[], key: string, qty: number): OrderLine[] {
  if (qty <= 0) return lines.filter((l) => l.key !== key)
  const line = lines.find((l) => l.key === key)
  if (line) line.quantity = Math.min(MAX_QTY, Math.max(1, Math.floor(qty)))
  return lines
}

// Sets an article's total from the menu row: − takes from the line without a
// note first, then from the newest line.
export function setItemQty(lines: OrderLine[], item: MenuItemDto, qty: number): OrderLine[] {
  const current = qtyOfItem(lines, item.id)
  if (qty > current) {
    let next = lines
    for (let i = current; i < Math.min(qty, MAX_QTY); i++) next = addItem(next, item)
    return next
  }
  let next = lines
  for (let i = current; i > Math.max(qty, 0); i--) {
    const own = next.filter((l) => l.menuItem.id === item.id)
    const line = own.find((l) => l.note === '') ?? own[own.length - 1]
    if (!line) break
    next = setLineQty(next, line.key, line.quantity - 1)
  }
  return next
}

// Lines that end up with the same article and note are merged.
export function setLineNote(lines: OrderLine[], key: string, note: string): OrderLine[] {
  const line = lines.find((l) => l.key === key)
  if (!line) return lines
  line.note = normalizeNote(note)
  const twin = lines.find((l) => l.key !== key && l.menuItem.id === line.menuItem.id && l.note === line.note)
  if (!twin) return lines
  twin.quantity = Math.min(MAX_QTY, twin.quantity + line.quantity)
  return lines.filter((l) => l.key !== key)
}

// Price plus Pfand: what one unit costs the guest.
export function unitTotal(item: { priceCents: number; depositCents?: number }): number {
  return item.priceCents + (item.depositCents ?? 0)
}

export function linesTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + unitTotal(l.menuItem) * l.quantity, 0)
}

export function linesDeposit(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + (l.menuItem.depositCents ?? 0) * l.quantity, 0)
}

export function qtyOfItem(lines: OrderLine[], menuItemId: string): number {
  return lines.reduce((n, l) => n + (l.menuItem.id === menuItemId ? l.quantity : 0), 0)
}

export function toOrderItems(lines: OrderLine[]) {
  return lines.map((l) => ({ menuItemId: l.menuItem.id, quantity: l.quantity, ...(l.note ? { note: l.note } : {}) }))
}

// Quantity per line key, taken when a send starts.
export function snapshotLines(lines: readonly OrderLine[]): Map<string, number> {
  return new Map(lines.map((l) => [l.key, l.quantity]))
}

// What is left after a send went through: changes made to the cart while it
// was sending stay, what was sent leaves.
export function remainingLines(lines: OrderLine[], sent: ReadonlyMap<string, number>): OrderLine[] {
  return lines
    .map((l) => ({ ...l, quantity: l.quantity - (sent.get(l.key) ?? 0) }))
    .filter((l) => l.quantity > 0)
}
