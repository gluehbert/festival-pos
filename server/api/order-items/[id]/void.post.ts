import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { auditLog, orderItems, orders } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES, TABLE_LEAD_ROLES } from '../../../lib/rbac'
import { requireActiveEvent } from '../../../lib/active-event'
import { OkSchema, VoidItemSchema } from '../../../lib/contracts/staff'
import { returnStock } from '../../../lib/stock'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Waiters may only void what kitchen/bar has not finished yet. Finished or
// served items need the shift lead or an admin, so "take the cash, then void"
// leaves a trail with someone else (and an item brought to a table where
// nobody ordered it can still be voided during the festival). Paid items go
// through the refund endpoint.
const WAITER_VOIDABLE = ['pending', 'in_progress']

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, SERVICE_ROLES)
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid order item id')
    const input = VoidItemSchema.parse(await readBody(event))

    const db = getDb()
    const ev = await requireActiveEvent(db)
    const item = (await db
      .select({
        paymentStatus: orderItems.paymentStatus,
        productionStatus: orderItems.productionStatus,
        listPriceCents: orderItems.listPriceCents,
        eventId: orders.eventId,
        isTrial: orders.isTrial,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.id, id))
      .limit(1))[0]
    if (!item || item.eventId !== ev.id) {
      throw new AppError('NOT_FOUND', 404, 'Order item not found')
    }
    // Staff meals (list price set, 0 €) are settled without money and can
    // be voided like open items.
    const isStaffMeal = item.listPriceCents !== null
    if (item.paymentStatus === 'paid' && !isStaffMeal) {
      throw new AppError('VOID_PAID', 409, 'Item already paid, refund it instead')
    }
    if (item.productionStatus === 'cancelled') {
      throw new AppError('VOID_CANCELLED', 409, 'Item already cancelled')
    }
    const isLead = TABLE_LEAD_ROLES.includes(staff.role)
    if (!isLead && !WAITER_VOIDABLE.includes(item.productionStatus)) {
      throw new AppError('VOID_ADMIN_ONLY', 403, 'Finished or served items can only be voided by the shift lead or an admin')
    }

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(orderItems)
        .set({
          productionStatus: 'cancelled',
          voidedByStaff: staff.staffId,
          voidedAt: new Date(),
          voidReason: input.reason,
        })
        // Guard against a payment, void or "done" that landed after the read above.
        .where(and(
          eq(orderItems.id, id),
          isStaffMeal ? isNotNull(orderItems.listPriceCents) : eq(orderItems.paymentStatus, 'unpaid'),
          isLead ? ne(orderItems.productionStatus, 'cancelled') : inArray(orderItems.productionStatus, WAITER_VOIDABLE),
        ))
        .returning({ id: orderItems.id, quantity: orderItems.quantity, menuItemId: orderItems.menuItemId })
      if (updated.length === 0) {
        throw new AppError('CONFLICT', 409, 'Item changed concurrently, please reload')
      }
      // The quantity as voided: a partial payment may have split the line meanwhile.
      // Rehearsal orders never took stock, so there is nothing to give back.
      if (!item.isTrial) await returnStock(tx, updated[0]!.menuItemId, updated[0]!.quantity)
      await tx.insert(auditLog).values({
        action: 'void',
        staffId: staff.staffId,
        targetKind: 'order_item',
        targetId: id,
        reason: input.reason,
        payload: { orderItemId: id, reason: input.reason, productionStatus: item.productionStatus },
      })
    })

    return OkSchema.parse({ ok: true })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
