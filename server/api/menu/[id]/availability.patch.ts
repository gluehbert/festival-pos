import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { auditLog, menuItems } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, STATION_ROLES } from '../../../lib/rbac'
import { requireActiveEvent } from '../../../lib/active-event'
import { AdminMenuItemSchema, AvailabilityPatchSchema } from '../../../lib/contracts/admin'
import { toAdminMenuItem } from '../../../lib/menu-dto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "Ausverkauft" on/off. Kitchen and bar may switch the items of their own
// station; admins any item.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['admin', ...STATION_ROLES])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID.test(id)) {
      throw new AppError('VALIDATION', 400, 'Invalid menu item id')
    }
    const body = await readBody(event)
    const input = AvailabilityPatchSchema.parse(body)

    const db = getDb()
    const ev = await requireActiveEvent(db)
    const existing = (await db.select().from(menuItems).where(and(eq(menuItems.id, id), eq(menuItems.eventId, ev.id))).limit(1))[0]
    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Menu item not found')
    }
    if (staff.role !== 'admin' && existing.station !== staff.role) {
      throw new AppError('FORBIDDEN', 403, 'Item belongs to another station')
    }
    if (input.isAvailable && existing.stock === 0) {
      throw new AppError('CONFLICT', 409, 'Stock is 0, raise the stock first')
    }

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(menuItems)
        .set({ isAvailable: input.isAvailable })
        .where(eq(menuItems.id, id))
        .returning()
      await tx.insert(auditLog).values({
        action: 'menu_availability',
        staffId: staff.staffId,
        targetKind: 'menu_item',
        targetId: id,
        payload: { isAvailable: input.isAvailable },
      })
      return rows[0]!
    })

    return AdminMenuItemSchema.parse(toAdminMenuItem(updated))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
