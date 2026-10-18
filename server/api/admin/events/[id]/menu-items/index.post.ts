import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { getDb } from '../../../../../db/client'
import { menuItems } from '../../../../../db/schema'
import { sendAppError } from '../../../../../lib/errors'
import { assertCsrf } from '../../../../../lib/csrf'
import { requireRole } from '../../../../../lib/rbac'
import { AdminMenuItemSchema, CreateMenuItemSchema } from '../../../../../lib/contracts/admin'
import { eventIdParam, loadEvent } from '../../../../../lib/events'
import { toAdminMenuItem } from '../../../../../lib/menu-dto'
import { writeAudit } from '../../../../../lib/audit'


export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const body = await readBody(event)
    const input = CreateMenuItemSchema.parse(body)

    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))

    const r = await db.transaction(async (tx) => {
      const row = (await tx
        .insert(menuItems)
        .values({
          eventId: ev.id,
          nameDe: input.nameDe,
          nameEn: input.nameEn,
          priceCents: input.priceCents,
          depositCents: input.depositCents ?? 0,
          stock: input.stock ?? null,
          isAvailable: input.stock !== 0,
          category: input.category,
          subcategory: input.subcategory ?? null,
          station: input.station,
          sortOrder: input.sortOrder ?? 0,
          allergens: input.allergens ?? null,
          diet: input.diet ?? null,
        })
        .returning())[0]!
      await writeAudit(tx, {
        action: 'menu_item_create',
        staffId: admin.staffId,
        targetKind: 'menu_item',
        targetId: row.id,
        payload: { eventId: ev.id, nameDe: row.nameDe, priceCents: row.priceCents, depositCents: row.depositCents, category: row.category, station: row.station },
      })
      return row
    })
    setResponseStatus(event, 201)
    return AdminMenuItemSchema.parse(toAdminMenuItem(r))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
