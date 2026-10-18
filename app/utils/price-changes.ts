import type { MenuItemDto, OrderResponseItem } from '~/../server/lib/contracts/guest'

// The server prices every order itself (a Happy Hour may have started or
// ended while the menu was open). These helpers compare what the cart showed
// with what was booked, and tell when the shown prices run out.

export interface PriceChange {
  menuItemId: string
  nameDe: string
  nameEn: string
  shownCents: number
  bookedCents: number
  ruleName: string | null
}

export function priceChanges(
  lines: ReadonlyArray<{ menuItem: MenuItemDto }>,
  booked: readonly OrderResponseItem[],
): PriceChange[] {
  const shown = new Map(lines.map((l) => [l.menuItem.id, l.menuItem]))
  const out = new Map<string, PriceChange>()
  for (const b of booked) {
    const item = shown.get(b.menuItemId)
    if (!item || item.priceCents === b.unitPriceCents || out.has(item.id)) continue
    out.set(item.id, {
      menuItemId: item.id,
      nameDe: item.nameDe,
      nameEn: item.nameEn,
      shownCents: item.priceCents,
      bookedCents: b.unitPriceCents,
      ruleName: b.priceRuleName ?? null,
    })
  }
  return [...out.values()]
}

// Earliest end of a running promotion in the menu, as a timestamp.
export function nextPromoEnd(items: readonly MenuItemDto[]): number | null {
  let next: number | null = null
  for (const i of items) {
    if (!i.promo) continue
    const t = Date.parse(i.promo.endsAt)
    if (Number.isFinite(t) && (next === null || t < next)) next = t
  }
  return next
}
