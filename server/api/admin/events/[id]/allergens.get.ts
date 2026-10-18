import { defineEventHandler, setResponseHeader } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { menuItems } from '../../../../db/schema'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { generateAllergenPdf } from '../../../../lib/allergen-pdf'
import { toMenuItemDto } from '../../../../lib/menu-dto'
import { eventIdParam, loadEvent } from '../../../../lib/events'

// A4 allergen notice to hang at the counter. Lists the whole menu, sold-out
// items included, grouped like the order tabs (first appearance by sort order).
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    const rows = (await db.select().from(menuItems).where(eq(menuItems.eventId, ev.id)).orderBy(asc(menuItems.sortOrder)))
      .map((r) => toMenuItemDto(r))
    const groupOf = (r: (typeof rows)[number]) => `${r.category}\u0000${r.subcategory ?? ''}`
    const firstIndex = new Map<string, number>()
    rows.forEach((r, i) => { if (!firstIndex.has(groupOf(r))) firstIndex.set(groupOf(r), i) })
    const ordered = rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => firstIndex.get(groupOf(a.r))! - firstIndex.get(groupOf(b.r))! || a.i - b.i)
      .map(({ r }) => r)

    const bytes = await generateAllergenPdf(ev.name, ordered)
    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', 'attachment; filename="allergene.pdf"')
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return Buffer.from(bytes)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
