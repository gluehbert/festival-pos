import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { events, payments, staff } from '../db/schema'
import { cashSessions, depositReturns, refunds, type CashSession } from '../db/schema-cash'
import type { CashSessionDto } from './contracts/cash'

const toIso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString()
const num = (v: unknown) => Number(v ?? 0)

interface Flows {
  collectedCents: number
  refundedCents: number
  depositReturnedCents: number // negative
}

// Cash this waiter took in and handed back while the drawer was open.
// Refunds count against the waiter who collected the payment, like the
// per-staff report; deposit returns against the waiter who paid them out.
export async function cashFlows(db: Db, s: CashSession, until: Date): Promise<Flows> {
  const window = (col: typeof payments.createdAt | typeof refunds.createdAt | typeof depositReturns.createdAt) =>
    and(gte(col, toDate(s.openedAt)), lte(col, until))
  const [paid] = await db
    .select({ total: sql<number>`COALESCE(SUM(${payments.totalCents}), 0)` })
    .from(payments)
    .where(and(
      eq(payments.eventId, s.eventId),
      eq(payments.staffId, s.staffId),
      eq(payments.isTrial, false),
      window(payments.createdAt),
    ))
  const [refunded] = await db
    .select({ total: sql<number>`COALESCE(SUM(${refunds.amountCents}), 0)` })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(and(
      eq(refunds.eventId, s.eventId),
      eq(payments.staffId, s.staffId),
      eq(payments.isTrial, false),
      window(refunds.createdAt),
    ))
  const [returned] = await db
    .select({ total: sql<number>`COALESCE(SUM(${depositReturns.amountCents}), 0)` })
    .from(depositReturns)
    .where(and(
      eq(depositReturns.eventId, s.eventId),
      eq(depositReturns.staffId, s.staffId),
      eq(depositReturns.isTrial, false),
      window(depositReturns.createdAt),
    ))
  return {
    collectedCents: num(paid?.total),
    refundedCents: num(refunded?.total),
    depositReturnedCents: num(returned?.total),
  }
}

export function expectedFrom(openingCents: number, f: Flows): number {
  return openingCents + f.collectedCents - f.refundedCents + f.depositReturnedCents
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d)
}

export async function toCashSessionDto(db: Db, s: CashSession, username: string): Promise<CashSessionDto> {
  const flows = await cashFlows(db, s, s.closedAt ? toDate(s.closedAt) : new Date())
  // A closed drawer keeps the Soll frozen at closing time.
  const expectedCents = s.expectedCents ?? expectedFrom(s.openingCents, flows)
  return {
    id: s.id,
    staffId: s.staffId,
    username,
    openedAt: toIso(s.openedAt),
    closedAt: s.closedAt ? toIso(s.closedAt) : null,
    openingCents: s.openingCents,
    ...flows,
    expectedCents,
    countedCents: s.countedCents,
    differenceCents: s.countedCents === null ? null : s.countedCents - expectedCents,
    note: s.note,
  }
}

export async function findOpenSession(db: Db, eventId: string, staffId: string): Promise<CashSession | null> {
  const rows = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.eventId, eventId), eq(cashSessions.staffId, staffId), isNull(cashSessions.closedAt)))
    .limit(1)
  return rows[0] ?? null
}

// The waiter's open drawer whatever the event: the one of the live event
// first, otherwise one left open at an ended event so it can still be closed.
// `otherEventName` is set when the drawer does not belong to the live event.
export async function findOpenSessionAnyEvent(
  db: Db,
  staffId: string,
): Promise<{ session: CashSession; otherEventName: string | null } | null> {
  const rows = await db
    .select({ s: cashSessions, name: events.name, live: events.isActive })
    .from(cashSessions)
    .innerJoin(events, eq(events.id, cashSessions.eventId))
    .where(and(eq(cashSessions.staffId, staffId), isNull(cashSessions.closedAt)))
    .orderBy(desc(events.isActive), desc(cashSessions.openedAt))
    .limit(1)
  const row = rows[0]
  return row ? { session: row.s, otherEventName: row.live ? null : row.name } : null
}

// All drawers of an event for the admin report, newest first.
export async function loadCashSessions(db: Db, eventId: string): Promise<CashSessionDto[]> {
  const rows = await db
    .select({ s: cashSessions, username: staff.username })
    .from(cashSessions)
    .innerJoin(staff, eq(staff.id, cashSessions.staffId))
    .where(eq(cashSessions.eventId, eventId))
    .orderBy(desc(cashSessions.openedAt))
  return Promise.all(rows.map((r) => toCashSessionDto(db, r.s, r.username)))
}
