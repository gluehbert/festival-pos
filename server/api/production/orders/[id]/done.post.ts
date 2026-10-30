import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { events, orderItems, orders } from '../../../../db/schema'
import { AppError, sendAppError } from '../../../../lib/errors'
import { kitchenReleased } from '../../../../lib/food-prepay'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import {
  ProductionOrderDoneResponseSchema,
  ProductionOrderDoneSchema,
  type Station,
} from '../../../../lib/contracts/production'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Kitchen or bar finishes a whole order in one tap. Only items of the
// caller's station are touched; the other station finishes its own part.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['kitchen', 'bar', 'admin'])
    const orderId = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(orderId)) {
      throw new AppError('VALIDATION', 400, 'Invalid order id')
    }
    const input = ProductionOrderDoneSchema.parse((await readBody(event)) ?? {})

    let station: Station
    if (staff.role === 'kitchen' || staff.role === 'bar') {
      if (input.station && input.station !== staff.role) {
        throw new AppError('FORBIDDEN', 403, `Role '${staff.role}' cannot finish items for station '${input.station}'`)
      }
      station = staff.role
    }
    else {
      if (!input.station) {
        throw new AppError('VALIDATION', 400, 'station required for admin')
      }
      station = input.station
    }

    const db = getDb()
    const found = await db
      .select({ id: orders.id, foodPrepayEnabled: events.foodPrepayEnabled })
      .from(orders)
      .innerJoin(events, eq(events.id, orders.eventId))
      .where(and(eq(orders.id, orderId), eq(events.isActive, true)))
      .limit(1)
    const ev = found[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'Order not found')
    }

    const done = await db
      .update(orderItems)
      .set({ productionStatus: 'done' })
      .where(and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.station, station),
        inArray(orderItems.productionStatus, ['pending', 'in_progress']),
        // Unpaid food is not on the kitchen screen, so it is not part of this tap.
        kitchenReleased(ev, station),
      ))
      .returning({ id: orderItems.id })

    return ProductionOrderDoneResponseSchema.parse({ orderId, doneItemIds: done.map((d) => d.id) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
