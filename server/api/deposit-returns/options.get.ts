import { defineEventHandler } from 'h3'
import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { menuItems } from '../../db/schema'
import { sendAppError } from '../../lib/errors'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'

// Deposit values on the active menu (e.g. 2,00 € glass, 5,00 € mug), also of
// sold-out items: those glasses still come back.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, SERVICE_ROLES)
    const db = getDb()
    const ev = await requireActiveEvent(db)
    if (!ev.depositEnabled) return { units: [] }
    const rows = await db
      .selectDistinct({ unitCents: menuItems.depositCents })
      .from(menuItems)
      .where(and(eq(menuItems.eventId, ev.id), gt(menuItems.depositCents, 0)))
    return { units: rows.map((r) => r.unitCents).sort((a, b) => a - b) }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
