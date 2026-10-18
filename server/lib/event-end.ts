import { and, count, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { events, orderItems, orders, paymentLocks, payments, staff } from '../db/schema'
import { cashSessions, depositReturns, refunds } from '../db/schema-cash'
import { writeAudit } from './audit'
import { EndCheckSchema, type EndCheck } from './contracts/admin'
import { AppError } from './errors'
import { lineTotalSql } from './line-total'
import { loadEvent } from './events'

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString()

// Open = ordered, not paid, not voided. Rehearsal orders and staff meals
// (0 €) never count.
const realLine = (eventId: string) =>
  and(eq(orders.eventId, eventId), eq(orders.isTrial, false), ne(orders.kind, 'staff_meal'), ne(orderItems.productionStatus, 'cancelled'))

export async function loadEndCheck(db: Db, eventId: string): Promise<EndCheck> {
  const open = await db
    .select({ tableNo: orders.tableNo, total: sql<number>`COALESCE(SUM(${lineTotalSql}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(realLine(eventId), eq(orderItems.paymentStatus, 'unpaid')))
    .groupBy(orders.tableNo)
    .orderBy(orders.tableNo)
  const [undelivered] = await db
    .select({ n: count() })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(realLine(eventId), eq(orderItems.productionStatus, 'done'), isNull(orderItems.servedAt)))
  const drawers = await db
    .select({ username: staff.username, openedAt: cashSessions.openedAt })
    .from(cashSessions)
    .innerJoin(staff, eq(staff.id, cashSessions.staffId))
    .where(and(eq(cashSessions.eventId, eventId), isNull(cashSessions.closedAt)))
    .orderBy(cashSessions.openedAt)
  return EndCheckSchema.parse({
    openTables: {
      count: open.length,
      totalCents: open.reduce((sum, r) => sum + Number(r.total), 0),
      tableNos: open.map((r) => r.tableNo),
    },
    openCashSessions: drawers.map((d) => ({ username: d.username, openedAt: iso(d.openedAt) })),
    undeliveredItems: Number(undelivered?.n ?? 0),
  })
}

// The only way to end a live event. Open drawers stay open so each waiter
// can still count their cash; payment locks would only block nobody.
export async function endEvent(db: Db, eventId: string, staffId: string): Promise<EndCheck> {
  const ev = await loadEvent(db, eventId)
  if (!ev.isActive) throw new AppError('EVENT_NOT_ACTIVE', 409, 'Event is not live')
  return await db.transaction(async (tx) => {
    const ended = await tx
      .update(events)
      .set({ isActive: false, deactivatedAt: sql`now()` })
      .where(and(eq(events.id, eventId), eq(events.isActive, true)))
      .returning({ id: events.id })
    if (ended.length === 0) throw new AppError('EVENT_NOT_ACTIVE', 409, 'Event is not live')
    const check = await loadEndCheck(tx, eventId)
    await tx.delete(paymentLocks).where(eq(paymentLocks.eventId, eventId))
    await writeAudit(tx, { action: 'event_end', staffId, targetKind: 'event', targetId: eventId, payload: { ...check } })
    return check
  })
}

// Deletes an ended event with everything that belongs to it. A bare DELETE on
// the event fails: rows without ON DELETE CASCADE point at the helper accounts
// (payments, refunds, drawers, deposit returns, payment locks) and at menu
// items (order lines), and Postgres checks those references while the event's
// own cascade is still running. So those rows go first.
export async function deleteEvent(db: Db, eventId: string, staffId: string): Promise<{ orders: number; payments: number }> {
  const ev = await loadEvent(db, eventId)
  if (ev.isActive) throw new AppError('EVENT_ACTIVE', 409, 'The live event cannot be deleted')
  if (!ev.deactivatedAt) throw new AppError('EVENT_NOT_ENDED', 409, 'Only ended events can be deleted')
  return await db.transaction(async (tx) => {
    const [orderCount] = await tx.select({ n: count() }).from(orders).where(eq(orders.eventId, eventId))
    const [paymentCount] = await tx.select({ n: count() }).from(payments).where(eq(payments.eventId, eventId))
    const result = { orders: Number(orderCount?.n ?? 0), payments: Number(paymentCount?.n ?? 0) }
    await tx.delete(paymentLocks).where(eq(paymentLocks.eventId, eventId))
    await tx.delete(refunds).where(eq(refunds.eventId, eventId))
    await tx.delete(depositReturns).where(eq(depositReturns.eventId, eventId))
    await tx.delete(payments).where(eq(payments.eventId, eventId))
    await tx.delete(cashSessions).where(eq(cashSessions.eventId, eventId))
    await tx.delete(orders).where(eq(orders.eventId, eventId))
    // Re-check inside the transaction: the event must not have been
    // reactivated in the meantime.
    const gone = await tx
      .delete(events)
      .where(eq(events.id, eventId))
      .returning({ id: events.id })
    if (gone.length === 0) throw new AppError('EVENT_ACTIVE', 409, 'The live event cannot be deleted')
    await writeAudit(tx, {
      action: 'event_delete',
      staffId,
      targetKind: 'event',
      targetId: eventId,
      payload: { name: ev.name, startsOn: ev.startsOn, endsOn: ev.endsOn, ...result },
    })
    return result
  })
}
