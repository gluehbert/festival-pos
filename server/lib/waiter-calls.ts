import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { staff, type Event } from '../db/schema'
import { tableAssignments, waiterCalls } from '../db/schema-service'
import type { CallReason, OpenCall, TableCall } from './contracts/waiter-calls'
import { AppError, isUniqueViolation } from './errors'

// Nobody answered within this time: the call goes to everyone in service.
export const ESCALATE_AFTER_MS = 2 * 60 * 1000
// The guest sees "someone is coming" this long after the call was answered,
// unless someone serves the table before.
const SHOW_COMING_MS = 3 * 60 * 1000
// After the service was at the table, the table cannot call again for this
// long: whoever wanted something could have said so.
const CALL_PAUSE_MS = 5 * 60 * 1000

const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v))

export function requireWaiterCalls(ev: Pick<Event, 'waiterCallsEnabled'>): void {
  if (!ev.waiterCallsEnabled) throw new AppError('FEATURE_OFF', 409, 'Calling the service is switched off for this event')
}

export async function loadTableCall(db: Db, eventId: string, tableNo: number): Promise<TableCall> {
  const [row] = await db
    .select({ reason: waiterCalls.reason, createdAt: waiterCalls.createdAt, acknowledgedAt: waiterCalls.acknowledgedAt, visitedAt: waiterCalls.visitedAt })
    .from(waiterCalls)
    .where(and(eq(waiterCalls.eventId, eventId), eq(waiterCalls.tableNo, tableNo)))
    .orderBy(desc(waiterCalls.createdAt))
    .limit(1)
  if (!row) return null
  const base = { reason: row.reason as CallReason, createdAt: toDate(row.createdAt).toISOString() }
  const since = (at: Date | string) => Date.now() - toDate(at).getTime()
  if (row.visitedAt !== null) return since(row.visitedAt) < CALL_PAUSE_MS ? { ...base, status: 'paused' } : null
  if (row.acknowledgedAt !== null) return since(row.acknowledgedAt) < SHOW_COMING_MS ? { ...base, status: 'coming' } : null
  return { ...base, status: 'waiting' }
}

// One call per table at a time: calling again while one is open changes
// nothing; while someone is coming or just was there, the table waits.
export async function createCall(db: Db, eventId: string, tableNo: number, reason: CallReason): Promise<TableCall> {
  const current = await loadTableCall(db, eventId, tableNo)
  if (current?.status === 'waiting') return current
  if (current) throw new AppError('RATE_LIMITED', 429, 'The service is on the way or was just here, please wait a moment')
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

// Someone is at the table anyway (payment, order, "asked"): the call is
// answered, "someone is coming" ends and the table's pause starts now.
export async function answerTableCalls(db: Db, eventId: string, tableNo: number, staffId: string): Promise<void> {
  const now = new Date()
  await db
    .update(waiterCalls)
    .set({
      acknowledgedAt: sql`coalesce(${waiterCalls.acknowledgedAt}, ${now})`,
      acknowledgedBy: sql`coalesce(${waiterCalls.acknowledgedBy}, ${staffId})`,
      visitedAt: now,
    })
    .where(and(
      eq(waiterCalls.eventId, eventId),
      eq(waiterCalls.tableNo, tableNo),
      isNull(waiterCalls.visitedAt),
      // Only a call still going on: serving a table that called long ago
      // must not pause it.
      or(isNull(waiterCalls.acknowledgedAt), gt(waiterCalls.acknowledgedAt, new Date(now.getTime() - SHOW_COMING_MS))),
    ))
}
