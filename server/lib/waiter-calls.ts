import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { staff, type Event } from '../db/schema'
import { tableAssignments, waiterCalls } from '../db/schema-service'
import type { CallReason, OpenCall, TableCall } from './contracts/waiter-calls'
import { AppError, isUniqueViolation } from './errors'

// Nobody answered within this time: the call goes to everyone in service.
export const ESCALATE_AFTER_MS = 2 * 60 * 1000
// A table can call again this long after its last call at the earliest.
const CALL_COOLDOWN_MS = 2 * 60 * 1000
// The guest sees "someone is coming" this long after the call was answered.
const SHOW_ANSWERED_MS = 10 * 60 * 1000

const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v))

export function requireWaiterCalls(ev: Pick<Event, 'waiterCallsEnabled'>): void {
  if (!ev.waiterCallsEnabled) throw new AppError('FEATURE_OFF', 409, 'Calling the service is switched off for this event')
}

export async function loadTableCall(db: Db, eventId: string, tableNo: number): Promise<TableCall> {
  const [row] = await db
    .select({ reason: waiterCalls.reason, createdAt: waiterCalls.createdAt, acknowledgedAt: waiterCalls.acknowledgedAt })
    .from(waiterCalls)
    .where(and(
      eq(waiterCalls.eventId, eventId),
      eq(waiterCalls.tableNo, tableNo),
      or(isNull(waiterCalls.acknowledgedAt), gt(waiterCalls.acknowledgedAt, new Date(Date.now() - SHOW_ANSWERED_MS))),
    ))
    .orderBy(desc(waiterCalls.createdAt))
    .limit(1)
  if (!row) return null
  return { reason: row.reason as CallReason, createdAt: toDate(row.createdAt).toISOString(), acknowledged: row.acknowledgedAt !== null }
}

// One open call per table: calling again while one is open changes nothing.
export async function createCall(db: Db, eventId: string, tableNo: number, reason: CallReason): Promise<TableCall> {
  const [last] = await db
    .select({ createdAt: waiterCalls.createdAt, acknowledgedAt: waiterCalls.acknowledgedAt })
    .from(waiterCalls)
    .where(and(eq(waiterCalls.eventId, eventId), eq(waiterCalls.tableNo, tableNo)))
    .orderBy(desc(waiterCalls.createdAt))
    .limit(1)
  if (last && last.acknowledgedAt === null) return await loadTableCall(db, eventId, tableNo)
  if (last && Date.now() - toDate(last.createdAt).getTime() < CALL_COOLDOWN_MS) {
    throw new AppError('RATE_LIMITED', 429, 'This table just called, please wait a moment', { retryAfterSeconds: CALL_COOLDOWN_MS / 1000 })
  }
  try {
    await db.insert(waiterCalls).values({ eventId, tableNo, reason })
  }
  catch (err) {
    // Another phone at the table called at the same moment.
    if (!isUniqueViolation(err)) throw err
  }
  return await loadTableCall(db, eventId, tableNo)
}

// Open calls, oldest first, with who holds the table.
export async function loadOpenCalls(db: Db, eventId: string): Promise<OpenCall[]> {
  const rows = await db
    .select({
      id: waiterCalls.id,
      tableNo: waiterCalls.tableNo,
      reason: waiterCalls.reason,
      createdAt: waiterCalls.createdAt,
      staffId: tableAssignments.staffId,
      username: staff.username,
    })
    .from(waiterCalls)
    .leftJoin(tableAssignments, and(eq(tableAssignments.eventId, waiterCalls.eventId), eq(tableAssignments.tableNo, waiterCalls.tableNo)))
    .leftJoin(staff, eq(staff.id, tableAssignments.staffId))
    .where(and(eq(waiterCalls.eventId, eventId), isNull(waiterCalls.acknowledgedAt)))
  const now = Date.now()
  return rows
    .map((r) => {
      const waitingMs = Math.max(0, now - toDate(r.createdAt).getTime())
      const assignee = r.staffId && r.username ? { staffId: r.staffId, username: r.username } : null
      return {
        id: r.id,
        tableNo: r.tableNo,
        reason: r.reason as CallReason,
        waitingSeconds: Math.floor(waitingMs / 1000),
        assignee,
        escalated: !assignee || waitingMs >= ESCALATE_AFTER_MS,
      }
    })
    .sort((a, b) => b.waitingSeconds - a.waitingSeconds)
}

export async function acknowledgeCall(db: Db, eventId: string, id: string, staffId: string): Promise<void> {
  const updated = await db
    .update(waiterCalls)
    .set({ acknowledgedAt: new Date(), acknowledgedBy: staffId })
    .where(and(eq(waiterCalls.id, id), eq(waiterCalls.eventId, eventId), isNull(waiterCalls.acknowledgedAt)))
    .returning({ id: waiterCalls.id })
  if (updated.length === 0) throw new AppError('NOT_FOUND', 404, 'No open call with this id')
}

// Someone is at the table anyway (payment, order, "asked"): the call is answered.
export async function answerTableCalls(db: Db, eventId: string, tableNo: number, staffId: string): Promise<void> {
  await db
    .update(waiterCalls)
    .set({ acknowledgedAt: new Date(), acknowledgedBy: staffId })
    .where(and(eq(waiterCalls.eventId, eventId), eq(waiterCalls.tableNo, tableNo), isNull(waiterCalls.acknowledgedAt)))
}
