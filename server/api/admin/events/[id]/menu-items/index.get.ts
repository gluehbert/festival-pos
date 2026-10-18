import { defineEventHandler } from 'h3'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../../../../../db/client'
import { menuItems } from '../../../../../db/schema'
import { sendAppError } from '../../../../../lib/errors'
import { requireRole } from '../../../../../lib/rbac'
import { AdminMenuListSchema } from '../../../../../lib/contracts/admin'
import { eventIdParam, loadEvent } from '../../../../../lib/events'
import { toAdminMenuItem } from '../../../../../lib/menu-dto'


export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    const rows = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.eventId, ev.id))
      .orderBy(asc(menuItems.sortOrder))
    return AdminMenuListSchema.parse({
      eventId: ev.id,
      items: rows.map(toAdminMenuItem),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
