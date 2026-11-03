import { defineEventHandler, getQuery } from 'h3'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { menuItems } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { isStationRole, requireRole, STATION_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { toMenuItemDto } from '../../lib/menu-dto'
import { servedStations } from '../../lib/cafe-routing'
import { MenuSchema } from '../../lib/contracts/guest'
import { ProductionQueueQuerySchema } from '../../lib/contracts/production'

// The station's articles including sold-out ones, to switch "ausverkauft"
// (the kitchen also gets the cafe's while the counter is closed).
export default defineEventHandler(async (event) => {
  try {
    const staff = requireRole(event, [...STATION_ROLES, 'admin'])
    const query = ProductionQueueQuerySchema.parse(getQuery(event))
    const station = isStationRole(staff.role) ? staff.role : query.station
    if (!station) throw new AppError('VALIDATION', 400, 'station query parameter required for admin')
    const db = getDb()
    const ev = await requireActiveEvent(db)
    const rows = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.eventId, ev.id), isNull(menuItems.archivedAt), inArray(menuItems.station, servedStations(station, ev))))
      .orderBy(asc(menuItems.sortOrder))
    return MenuSchema.parse({ eventId: ev.id, items: rows.map((r) => toMenuItemDto(r)) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
