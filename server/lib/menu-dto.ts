import type { MenuItem } from '../db/schema'
import type { AdminMenuItem } from './contracts/admin'
import type { MenuItemDto } from './contracts/guest'
import type { Allergen, Diet } from './allergens'
import type { EffectivePrice } from './pricing'

const toIso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString()

// What guests and waiters see of a menu item; `price` is the price right
// now (lib/pricing.ts), without it the menu price.
export function toMenuItemDto(r: MenuItem, price?: EffectivePrice): MenuItemDto {
  return {
    id: r.id,
    nameDe: r.nameDe,
    nameEn: r.nameEn,
    priceCents: price?.priceCents ?? r.priceCents,
    regularPriceCents: r.priceCents,
    promo: price?.rule ? { name: price.rule.name, endsAt: price.rule.endsAt } : null,
    depositCents: r.depositCents,
    stock: r.stock,
    category: r.category,
    subcategory: r.subcategory ?? null,
    station: r.station as 'kitchen' | 'bar' | 'cafe',
    isAvailable: r.isAvailable,
    sortOrder: r.sortOrder,
    allergens: (r.allergens ?? null) as Allergen[] | null,
    diet: (r.diet ?? null) as Diet | null,
  }
}

export function toAdminMenuItem(r: MenuItem): AdminMenuItem {
  // Menu price only; AdminMenuItemSchema drops the promotion fields.
  return { ...toMenuItemDto(r), eventId: r.eventId, createdAt: toIso(r.createdAt) }
}
