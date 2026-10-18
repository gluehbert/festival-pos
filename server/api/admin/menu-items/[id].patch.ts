import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { menuItems } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole } from '../../../lib/rbac'
import { AdminMenuItemSchema, UpdateMenuItemSchema } from '../../../lib/contracts/admin'
import { toAdminMenuItem } from '../../../lib/menu-dto'
import { diffFields, writeAudit } from '../../../lib/audit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID.test(id)) {
      throw new AppError('VALIDATION', 400, 'Invalid menu item id')
    }
    const body = await readBody(event)
    const patch = UpdateMenuItemSchema.parse(body)

    const db = getDb()
    const existing = (await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1))[0]
    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Menu item not found')
    }

    const updates: Record<string, unknown> = {}
    if (patch.nameDe !== undefined) updates.nameDe = patch.nameDe
    if (patch.nameEn !== undefined) updates.nameEn = patch.nameEn
    if (patch.priceCents !== undefined) updates.priceCents = patch.priceCents
    if (patch.depositCents !== undefined) updates.depositCents = patch.depositCents
    if (patch.stock !== undefined) {
      updates.stock = patch.stock
      // Stock 0 means sold out; restocking an item sold out by its stock
      // brings it back.
      if (patch.stock === 0) updates.isAvailable = false
      else if (patch.stock !== null && existing.stock === 0) updates.isAvailable = true
    }
    if (patch.category !== undefined) updates.category = patch.category
    if (patch.subcategory !== undefined) updates.subcategory = patch.subcategory
    if (patch.station !== undefined) updates.station = patch.station
    if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder
    if (patch.allergens !== undefined) updates.allergens = patch.allergens
    if (patch.diet !== undefined) updates.diet = patch.diet

    // Price and name changes are what an audit is asked about later.
    const changes = diffFields(existing, updates as Partial<typeof existing>)
    const r = Object.keys(changes).length === 0
      ? existing
      : await db.transaction(async (tx) => {
          const row = (await tx.update(menuItems).set(updates).where(eq(menuItems.id, id)).returning())[0]!
          await writeAudit(tx, { action: 'menu_item_update', staffId: admin.staffId, targetKind: 'menu_item', targetId: id, payload: { eventId: existing.eventId, changes } })
          return row
        })
    return AdminMenuItemSchema.parse(toAdminMenuItem(r))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
