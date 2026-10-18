import { and, eq, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems, orders, payments } from '../db/schema'

// 'paid' once nothing on the ticket is left to pay.
export async function ticketStatusAfter(
  db: Db,
  eventId: string,
  ticket: { walkOrderId: string } | { tableNo: number },
): Promise<'open' | 'paid'> {
  const remainingWhere = 'walkOrderId' in ticket
    ? and(
      eq(orders.id, ticket.walkOrderId),
      eq(orderItems.paymentStatus, 'unpaid'),
      ne(orderItems.productionStatus, 'cancelled'),
    )
    : and(
      eq(orders.eventId, eventId),
      eq(orders.tableNo, ticket.tableNo),
      ne(orders.kind, 'walkin'),
      eq(orderItems.paymentStatus, 'unpaid'),
      ne(orderItems.productionStatus, 'cancelled'),
    )
  const remaining = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(remainingWhere)
    .limit(1)
  return remaining.length === 0 ? 'paid' : 'open'
}

// The payment this cashier already booked under this Idempotency-Key, if any.
export async function findBookedPayment(
  db: Db,
  eventId: string,
  staffId: string,
  key: string,
): Promise<{ id: string; totalCents: number; tipCents: number } | null> {
  const rows = await db
    .select({ id: payments.id, totalCents: payments.totalCents, tipCents: payments.tipCents })
    .from(payments)
    .where(and(eq(payments.eventId, eventId), eq(payments.staffId, staffId), eq(payments.idempotencyKey, key)))
    .limit(1)
  return rows[0] ?? null
}
