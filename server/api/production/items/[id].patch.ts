import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { orderItems, orders } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole } from '../../../lib/rbac'
import { requireActiveEvent } from '../../../lib/active-event'
import {
  ProductionPatchResponseSchema,
  ProductionStatusPatchSchema,
} from '../../../lib/contracts/production'

// done → in_progress is the "Undo" of kitchen/bar, possible until the
// waiter has served the item.
const TRANSITIONS: Record<string, ReadonlyArray<'in_progress' | 'done'>> = {
  pending: ['in_progress'],
  in_progress: ['done'],
  done: ['in_progress'],
}

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['kitchen', 'bar', 'admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new AppError('VALIDATION', 400, 'Invalid order item id')
    }
    const body = await readBody(event)
    const input = ProductionStatusPatchSchema.parse(body)

    const db = getDb()
    const ev = await requireActiveEvent(db)
    const rows = await db
      .select({ item: orderItems })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.id, id), eq(orders.eventId, ev.id)))
      .limit(1)
    const item = rows[0]?.item
    if (!item) {
      throw new AppError('NOT_FOUND', 404, 'Order item not found')
    }

    if (staff.role !== 'admin' && staff.role !== item.station) {
      throw new AppError(
        'FORBIDDEN',
        403,
        `Role '${staff.role}' cannot modify items for station '${item.station}'`,
      )
    }

    const allowed = TRANSITIONS[item.productionStatus] ?? []
    if (!allowed.includes(input.nextStatus)) {
      throw new AppError(
        'CONFLICT',
        409,
        `Transition '${item.productionStatus}' → '${input.nextStatus}' not allowed`,
      )
    }

    const undo = item.productionStatus === 'done'
    if (undo && item.servedAt) {
      throw new AppError('ALREADY_SERVED', 409, 'Item was already served, it cannot be reopened')
    }

    // Only apply the transition if nobody else moved (or served) the item in the meantime.
    const updated = await db
      .update(orderItems)
      .set({ productionStatus: input.nextStatus })
      .where(and(
        eq(orderItems.id, id),
        eq(orderItems.productionStatus, item.productionStatus),
        ...(undo ? [isNull(orderItems.servedAt)] : []),
      ))
      .returning({ id: orderItems.id })
    if (updated.length === 0) {
      throw new AppError('CONFLICT', 409, 'Item status changed concurrently, reload and retry')
    }

    return ProductionPatchResponseSchema.parse({
      orderItemId: id,
      productionStatus: input.nextStatus,
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
