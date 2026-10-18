import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../../db/client'
import { auditLog, orderItems, orders, paymentItems } from '../../../../db/schema'
import { refunds } from '../../../../db/schema-cash'
import { AppError, sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { lineTotalCents } from '../../../../lib/line-total'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RefundSchema = z.object({ reason: z.string().trim().min(3).max(200) })

// Admin-only: cancel an item that was already paid and record the cash that
// is handed back. Unpaid items are voided via the regular void endpoint.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
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
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(paymentItems, eq(paymentItems.orderItemId, orderItems.id))
      .where(eq(orderItems.id, id))
      .limit(1))[0]
    if (!item) throw new AppError('NOT_FOUND', 404, 'Order item not found')
    if (!item.paymentId) throw new AppError('CONFLICT', 409, 'Item is not paid, void it instead')

    // Hands back what was paid for the line, Pfand included.
    const amountCents = lineTotalCents(item)
    const refundId = await db.transaction(async (tx) => {
      const cancelled = await tx
        .update(orderItems)
        .set({ productionStatus: 'cancelled', voidReason: reason, voidedByStaff: admin.staffId, voidedAt: new Date() })
        .where(and(eq(orderItems.id, id), eq(orderItems.paymentStatus, 'paid'), ne(orderItems.productionStatus, 'cancelled')))
        .returning({ id: orderItems.id })
      if (cancelled.length === 0) throw new AppError('CONFLICT', 409, 'Item was already refunded or voided')
      const inserted = await tx
        .insert(refunds)
        .values({ eventId: item.eventId, orderItemId: id, paymentId: item.paymentId!, staffId: admin.staffId, amountCents, reason })
        .returning({ id: refunds.id })
      await tx.insert(auditLog).values({
        action: 'refund',
        staffId: admin.staffId,
        targetKind: 'order_item',
        targetId: id,
        reason,
        payload: { orderItemId: id, paymentId: item.paymentId, amountCents },
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
