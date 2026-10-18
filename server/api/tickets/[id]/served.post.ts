import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../db/client'
import { events, orderItems, orders } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../../lib/rbac'
import { parseTicketKey } from '../../../lib/tickets'
import { StationEnum } from '../../../lib/contracts/production'

const BodySchema = z.object({ station: StationEnum.optional() })

// The waiter brought the finished items to the table: clears the
// "food/drinks ready" hint. Optional station = only food or only drinks.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    requireRole(event, SERVICE_ROLES)
    const id = getRouterParam(event, 'id') ?? ''
    const parsed = parseTicketKey(id)
    if (!parsed) {
      throw new AppError('VALIDATION', 400, `Invalid ticket key '${id}'`)
    }
    const input = BodySchema.parse((await readBody(event)) ?? {})
    const db = getDb()
    const evRows = await db.select({ id: events.id }).from(events).where(eq(events.isActive, true)).limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }

    const orderIds = db
      .select({ id: orders.id })
      .from(orders)
      .where(parsed.kind === 'walkin'
        ? and(eq(orders.eventId, ev.id), eq(orders.id, parsed.orderId!), eq(orders.kind, 'walkin'))
        : and(eq(orders.eventId, ev.id), eq(orders.tableNo, parsed.tableNo!), ne(orders.kind, 'walkin')))

    const served = await db
      .update(orderItems)
      .set({ servedAt: new Date() })
      .where(and(
        inArray(orderItems.orderId, orderIds),
        eq(orderItems.productionStatus, 'done'),
        isNull(orderItems.servedAt),
        input.station ? eq(orderItems.station, input.station) : undefined,
      ))
      .returning({ id: orderItems.id })

    return { ticketKey: id, servedItemIds: served.map((s) => s.id) }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
