import { and, eq, gt, isNull, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { paymentLocks } from '../db/schema'
import { AppError, isUniqueViolation } from './errors'

const LOCK_TTL_SECONDS = 60

export interface PaymentLockTarget {
  eventId: string
  tableNo: number
  walkOrderId: string | null
  staffId: string
}

// One cashier per ticket at a time, the same cashier in a second tab included.
// The lock lives only for the booking itself; the TTL covers a crashed request.
export async function acquirePaymentLock(db: Db, t: PaymentLockTarget): Promise<string> {
  const now = new Date()
  const active = await db
    .select({ staffId: paymentLocks.staffId, expiresAt: paymentLocks.expiresAt, orderId: paymentLocks.orderId, tableNo: paymentLocks.tableNo })
    .from(paymentLocks)
    .where(and(eq(paymentLocks.eventId, t.eventId), gt(paymentLocks.expiresAt, now)))
  const conflict = active.find((l) =>
    t.walkOrderId !== null
      ? l.orderId === t.walkOrderId
      : l.tableNo === t.tableNo && l.orderId === null,
  )
  if (conflict) {
    const exp = conflict.expiresAt instanceof Date
      ? conflict.expiresAt
      : new Date(conflict.expiresAt as unknown as string)
    throw new AppError('LOCK_CONFLICT', 409, 'Ticket is locked by another cashier', {
      lockedBy: conflict.staffId,
      expiresAt: exp.toISOString(),
    })
  }

  try {
    // An expired lock row for the same ticket would block the unique index.
    await db.delete(paymentLocks).where(and(
      eq(paymentLocks.eventId, t.eventId),
      eq(paymentLocks.tableNo, t.tableNo),
      t.walkOrderId !== null ? eq(paymentLocks.orderId, t.walkOrderId) : isNull(paymentLocks.orderId),
      lte(paymentLocks.expiresAt, now),
    ))
    const inserted = await db
      .insert(paymentLocks)
      .values({
        eventId: t.eventId,
        tableNo: t.tableNo,
        orderId: t.walkOrderId,
        staffId: t.staffId,
        expiresAt: new Date(Date.now() + LOCK_TTL_SECONDS * 1000),
      })
      .returning({ id: paymentLocks.id })
    return inserted[0]!.id
  }
  catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('LOCK_CONFLICT', 409, 'Ticket is locked by another cashier')
    }
    throw err
  }
}

export async function releasePaymentLock(db: Db, lockId: string): Promise<void> {
  await db.delete(paymentLocks).where(eq(paymentLocks.id, lockId))
}
