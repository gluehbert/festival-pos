import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../../db/client'
import { auditLog, orderItems, orders, paymentItems, payments } from '../../../../db/schema'
import { refunds } from '../../../../db/schema-cash'
import { AppError, sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole, TABLE_LEAD_ROLES } from '../../../../lib/rbac'
import { requireActiveEvent } from '../../../../lib/active-event'
import { findOpenSession } from '../../../../lib/cash-sessions'
import { lineTotalCents } from '../../../../lib/line-total'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RefundSchema = z.object({ reason: z.string().trim().min(3).max(200) })

// Shift lead or admin: cancel an item that was already paid and record the cash
// that is handed back. The path stays under /api/admin for compatibility; there
// is no admin-only middleware, so the role check here is what guards it.
// The money comes out of the refunding person's drawer, so one must be open.
// Unpaid items are voided via the regular void endpoint.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireRole(event, TABLE_LEAD_ROLES)
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid order item id')
    const { reason } = RefundSchema.parse(await readBody(event))

    const db = getDb()
    const item = (await db
      .select({
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        depositCents: orderItems.depositCents,
        eventId: orders.eventId,
        paymentId: paymentItems.paymentId,
        payerStaffId: payments.staffId,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(paymentItems, eq(paymentItems.orderItemId, orderItems.id))
      .leftJoin(payments, eq(payments.id, paymentItems.paymentId))
      .where(eq(orderItems.id, id))
      .limit(1))[0]
    if (!item) throw new AppError('NOT_FOUND', 404, 'Order item not found')
    if (!item.paymentId) throw new AppError('CONFLICT', 409, 'Item is not paid, void it instead')

    const live = await requireActiveEvent(db)
    if (!(await findOpenSession(db, live.id, me.staffId))) {
      throw new AppError('CASH_SESSION_REQUIRED', 409, 'Open your drawer first, then refund')
    }

    // Hands back what was paid for the line, Pfand included.
    const amountCents = lineTotalCents(item)
    const refundId = await db.transaction(async (tx) => {
      const cancelled = await tx
        .update(orderItems)
        .set({ productionStatus: 'cancelled', voidReason: reason, voidedByStaff: me.staffId, voidedAt: new Date() })
        .where(and(eq(orderItems.id, id), eq(orderItems.paymentStatus, 'paid'), ne(orderItems.productionStatus, 'cancelled')))
        .returning({ id: orderItems.id })
      if (cancelled.length === 0) throw new AppError('CONFLICT', 409, 'Item was already refunded or voided')
      const inserted = await tx
        .insert(refunds)
        .values({ eventId: item.eventId, orderItemId: id, paymentId: item.paymentId!, staffId: me.staffId, amountCents, reason })
        .returning({ id: refunds.id })
      await tx.insert(auditLog).values({
        action: 'refund',
        staffId: me.staffId,
        targetKind: 'order_item',
        targetId: id,
        reason,
        payload: { orderItemId: id, paymentId: item.paymentId, payerStaffId: item.payerStaffId, amountCents },
      })
      return inserted[0]!.id
    })

    setResponseStatus(event, 201)
    return { refundId, orderItemId: id, amountCents }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
