import { defineEventHandler, setResponseHeader } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../../../../../db/client'
import { menuItems } from '../../../../../db/schema'
import { sendAppError } from '../../../../../lib/errors'
import { requireRole } from '../../../../../lib/rbac'
import { buildMenuWorkbook } from '../../../../../lib/menu-excel'
import type { Allergen, Diet } from '../../../../../lib/allergens'
import { eventIdParam, loadEvent } from '../../../../../lib/events'

// Excel (.xlsx, Office Open XML) price list: the event's current menu,
// or example rows when the menu is still empty. Edit and re-import it.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    const rows = await db.select().from(menuItems).where(eq(menuItems.eventId, ev.id)).orderBy(asc(menuItems.sortOrder))
    const buffer = await buildMenuWorkbook(rows.map((r) => ({
      nameDe: r.nameDe,
      nameEn: r.nameEn,
      priceCents: r.priceCents,
      depositCents: r.depositCents,
      category: r.category,
      subcategory: r.subcategory ?? null,
      station: r.station as 'kitchen' | 'bar',
      sortOrder: r.sortOrder,
      isAvailable: r.isAvailable,
      allergens: (r.allergens ?? null) as Allergen[] | null,
      diet: (r.diet ?? null) as Diet | null,
    })))
    setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setResponseHeader(event, 'Content-Disposition', 'attachment; filename="speisekarte.xlsx"')
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return buffer
  }
  catch (err) {
    sendAppError(event, err)
  }
})
