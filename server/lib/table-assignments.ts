import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { auditLog, staff } from '../db/schema'
import { tableAssignments } from '../db/schema-service'
import type { Assignee, TableAssignment } from './contracts/tables'
import type { Tx } from './audit'
import { AppError } from './errors'
import { SERVING_ROLES, TABLE_LEAD_ROLES } from './rbac'

function iso(v: Date | string): string {
  return (v instanceof Date ? v : new Date(v)).toISOString()
}

// All held tables of the event, with the waiter's name (one query per poll).
export async function loadAssignments(db: Db, eventId: string): Promise<TableAssignment[]> {
  const rows = await db
    .select({
      tableNo: tableAssignments.tableNo,
      staffId: tableAssignments.staffId,
      username: staff.username,
      assignedAt: tableAssignments.assignedAt,
    })
    .from(tableAssignments)
    .innerJoin(staff, eq(staff.id, tableAssignments.staffId))
    .where(eq(tableAssignments.eventId, eventId))
  return rows
    .map((r) => ({ ...r, assignedAt: iso(r.assignedAt) }))
    .sort((a, b) => a.tableNo - b.tableNo)
}

export async function loadAssignee(db: Db, eventId: string, tableNo: number): Promise<Assignee | null> {
  const rows = await db
    .select({ staffId: tableAssignments.staffId, username: staff.username })
    .from(tableAssignments)
    .innerJoin(staff, eq(staff.id, tableAssignments.staffId))
    .where(and(eq(tableAssignments.eventId, eventId), eq(tableAssignments.tableNo, tableNo)))
    .limit(1)
  return rows[0] ?? null
}

// Claims a free table; never takes one away from someone else.
// Returns true when the table is (now) held by `staffId`.
export async function claimIfFree(db: Db, eventId: string, tableNo: number, staffId: string): Promise<boolean> {
  await db
    .insert(tableAssignments)
    .values({ eventId, tableNo, staffId })
    .onConflictDoNothing({ target: [tableAssignments.eventId, tableAssignments.tableNo] })
  // Read back instead of trusting RETURNING: whoever won the race holds it.
  return (await loadAssignee(db, eventId, tableNo))?.staffId === staffId
}

// "My table" / "take over table". Someone else's table only with takeOver
// (the waiter confirmed it, or a shift lead hands it on); that is written to
// the audit log under whoever did it.
export async function assignTable(
  db: Db,
  eventId: string,
  tableNo: number,
  staffId: string,
  takeOver: boolean,
  actorId: string = staffId,
): Promise<void> {
  if (await claimIfFree(db, eventId, tableNo, staffId)) return
  const current = await loadAssignee(db, eventId, tableNo)
  if (current && !takeOver) {
    throw new AppError('TABLE_TAKEN', 409, `Table ${tableNo} is held by ${current.username}`, { assignee: current })
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(tableAssignments)
      .values({ eventId, tableNo, staffId })
      .onConflictDoUpdate({
        target: [tableAssignments.eventId, tableAssignments.tableNo],
        set: { staffId, assignedAt: new Date() },
      })
    if (current) {
      await tx.insert(auditLog).values({
        action: 'table_takeover',
        staffId: actorId,
        targetKind: 'table',
        targetId: eventId,
        payload: { tableNo, staffId, previousStaffId: current.staffId, previousUsername: current.username },
      })
    }
  })
}

// Gives a table back. Waiters only their own; a shift lead or admin may free
// any table (audited when it was someone else's).
export async function releaseTable(
  db: Db,
  eventId: string,
  tableNo: number,
  actor: { staffId: string; role: string },
): Promise<void> {
  const current = await loadAssignee(db, eventId, tableNo)
  if (!current) return
  const own = current.staffId === actor.staffId
  if (!own && !(TABLE_LEAD_ROLES as readonly string[]).includes(actor.role)) {
    throw new AppError('TABLE_TAKEN', 409, `Table ${tableNo} is held by ${current.username}`, { assignee: current })
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(tableAssignments)
      .where(and(eq(tableAssignments.eventId, eventId), eq(tableAssignments.tableNo, tableNo)))
    if (!own) {
      await tx.insert(auditLog).values({
        action: 'table_release',
        staffId: actor.staffId,
        targetKind: 'table',
        targetId: eventId,
        payload: { tableNo, previousStaffId: current.staffId, previousUsername: current.username },
      })
    }
  })
}

// A deactivated waiter (or one moved to kitchen/bar) no longer serves tables.
export async function releaseAllOf(db: Db | Tx, staffId: string): Promise<number> {
  const rows = await db
    .delete(tableAssignments)
    .where(eq(tableAssignments.staffId, staffId))
    .returning({ id: tableAssignments.id })
  return rows.length
}

// The people a shift lead can hand tables to: active waiters and leads, the
// club's own and those who joined this event by link.
export async function loadTeam(db: Db, eventId: string): Promise<Assignee[]> {
  return await db
    .select({ staffId: staff.id, username: staff.username })
    .from(staff)
    .where(and(
      eq(staff.isActive, true),
      inArray(staff.role, [...SERVING_ROLES]),
      or(isNull(staff.eventId), eq(staff.eventId, eventId)),
    ))
    .orderBy(asc(staff.username))
}

export async function requireTeamMember(db: Db, eventId: string, staffId: string): Promise<void> {
  const team = await loadTeam(db, eventId)
  if (!team.some((m) => m.staffId === staffId)) {
    throw new AppError('VALIDATION', 400, 'Tables can only go to an active waiter of this event')
  }
}

// Usernames for walk-in creators, keyed by staff id.
export async function loadUsernames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ id: staff.id, username: staff.username }).from(staff).where(inArray(staff.id, ids))
  return new Map(rows.map((r) => [r.id, r.username]))
}
