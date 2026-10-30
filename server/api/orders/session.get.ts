import { defineEventHandler } from 'h3'
import { and, eq, ne, sql } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events, menuItems, orderItems, orders } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { SessionOrdersSchema } from '../../lib/contracts/guest'
import { lineTotalSql } from '../../lib/line-total'
import { isHeldFood } from '../../lib/food-prepay'

export default defineEventHandler(async (event) => {
  try {
    const guest = event.context.guest
    if (!guest) {
      throw new AppError('UNAUTHORIZED', 401, 'Guest session required')
    }
    const db = getDb()
    const [ev] = await db.select({ foodPrepayEnabled: events.foodPrepayEnabled }).from(events).where(eq(events.id, guest.eventId))

    const items = await db
      .select({
        orderItemId: orderItems.id,
        nameDe: menuItems.nameDe,
        nameEn: menuItems.nameEn,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        note: orderItems.note,
        productionStatus: orderItems.productionStatus,
        paymentStatus: orderItems.paymentStatus,
        station: orderItems.station,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
      .where(eq(orders.guestSessionId, guest.sessionId))

    // Counter sales (walk-ins) keep their own ticket even when the waiter
    // typed a table number; same filter as computeTableBalance.
    const balanceRows = await db
      .select({
        sum: sql<string | number | null>`COALESCE(SUM(${lineTotalSql}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.eventId, guest.eventId),
          eq(orders.tableNo, guest.tableNo),
          ne(orders.kind, 'walkin'),
          eq(orderItems.paymentStatus, 'unpaid'),
          ne(orderItems.productionStatus, 'cancelled'),
        ),
      )
    const raw = balanceRows[0]?.sum ?? 0
    const tableBalanceCents = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw)

    const tableItems = await db
      .select({
        paymentStatus: orderItems.paymentStatus,
        productionStatus: orderItems.productionStatus,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.eventId, guest.eventId),
          eq(orders.tableNo, guest.tableNo),
          ne(orders.kind, 'walkin'),
          ne(orderItems.productionStatus, 'cancelled'),
        ),
      )
    const hasUnpaid = tableItems.some((i) => i.paymentStatus === 'unpaid')
    const hasPaid = tableItems.some((i) => i.paymentStatus === 'paid')
    const ticketStatus: 'open' | 'paid' = !hasUnpaid && hasPaid ? 'paid' : 'open'

    return SessionOrdersSchema.parse({
      tableNo: guest.tableNo,
      ticketStatus,
      items: items.map((i) => ({
        orderItemId: i.orderItemId,
        nameDe: i.nameDe,
        nameEn: i.nameEn,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        note: i.note,
        productionStatus: i.productionStatus as 'pending' | 'in_progress' | 'done' | 'cancelled',
        paymentStatus: i.paymentStatus as 'unpaid' | 'paid',
        awaitingPayment: !!ev && isHeldFood(ev, i),
      })),
      tableBalanceCents,
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
