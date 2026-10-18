import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { events, menuItems, orderItems, orders, paymentItems, payments, staff } from '../db/schema'
import type { Receipt } from './contracts/staff'

const toIso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString()

// What the guest gets on paper after paying: event, table, the paid lines,
// total, time and cashier. Built from the booked payment, so a retried
// request prints the same receipt.
export async function loadReceipt(db: Db, paymentId: string): Promise<Receipt> {
  const [head] = await db
    .select({ totalCents: payments.totalCents, createdAt: payments.createdAt, username: staff.username, eventName: events.name })
    .from(payments)
    .innerJoin(staff, eq(staff.id, payments.staffId))
    .innerJoin(events, eq(events.id, payments.eventId))
    .where(eq(payments.id, paymentId))
    .limit(1)
  const lines = await db
    .select({
      nameDe: menuItems.nameDe,
      nameEn: menuItems.nameEn,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      depositCents: orderItems.depositCents,
      note: orderItems.note,
      tableNo: orders.tableNo,
      kind: orders.kind,
      createdAt: orderItems.createdAt,
    })
    .from(paymentItems)
    .innerJoin(orderItems, eq(orderItems.id, paymentItems.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(eq(paymentItems.paymentId, paymentId))
  lines.sort((a, b) => toIso(a.createdAt).localeCompare(toIso(b.createdAt)))
  const first = lines[0]
  return {
    paymentId,
    eventName: head!.eventName,
    tableNo: first && first.kind !== 'walkin' ? first.tableNo : null,
    lines: lines.map((l) => ({
      nameDe: l.nameDe,
      nameEn: l.nameEn,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      depositCents: l.depositCents,
      note: l.note,
    })),
    totalCents: head!.totalCents,
    depositCents: lines.reduce((s, l) => s + l.depositCents * l.quantity, 0),
    paidAt: toIso(head!.createdAt),
    staffUsername: head!.username,
  }
}
