import { createHash, randomBytes } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { auditLog, events, staff, type Event } from '../db/schema'
import { staffJoinRequests } from '../db/schema-auth'
import { AppError } from './errors'
import type { JoinDecision, JoinOverview } from './contracts/join'

// Join by link: one code per event, helpers type their name and wait until an
// admin lets them in. Anyone may know the code; nobody gets in without the
// admin, which is what keeps cash and tables tied to the right person.

// A full waiting room means someone is spamming the link.
export const MAX_PENDING = 30

export const newJoinCode = (): string => randomBytes(9).toString('base64url')
export const newJoinToken = (): string => randomBytes(32).toString('base64url')
export const hashJoinToken = (token: string): string => createHash('sha256').update(token).digest('hex')

const sameName = (column: unknown, name: string) => sql`lower(${column}) = lower(${name})`

export async function eventForJoinCode(db: Db, code: string): Promise<Event> {
  const ev = (await db.select().from(events)
    .where(and(eq(events.joinCode, code), eq(events.isActive, true))).limit(1))[0]
  if (!ev) throw new AppError('JOIN_CLOSED', 404, 'This join link is not valid (anymore)')
  return ev
}

// Puts a name into the waiting room. A name already waiting is refused; a name
// already working at the event becomes a request to sign that person in again.
export async function requestToJoin(db: Db, ev: Event, name: string, tokenHash: string): Promise<void> {
  const waiting = await db.select({ name: staffJoinRequests.name }).from(staffJoinRequests)
    .where(and(eq(staffJoinRequests.eventId, ev.id), eq(staffJoinRequests.status, 'pending')))
  if (waiting.some((w) => w.name.toLowerCase() === name.toLowerCase())) {
    throw new AppError('NAME_WAITING', 409, 'Someone with this name is already waiting')
  }
  if (waiting.length >= MAX_PENDING) throw new AppError('RATE_LIMITED', 429, 'Too many people waiting')
  const known = (await db.select({ id: staff.id }).from(staff)
    .where(and(eq(staff.eventId, ev.id), sameName(staff.username, name))).limit(1))[0]
  await db.insert(staffJoinRequests).values({ eventId: ev.id, name, tokenHash, staffId: known?.id ?? null })
}

export async function joinRequestByToken(db: Db, tokenHash: string) {
  return (await db.select().from(staffJoinRequests).where(eq(staffJoinRequests.tokenHash, tokenHash)).limit(1))[0]
}

export async function joinOverview(db: Db, ev: Event, baseUrl: string): Promise<JoinOverview> {
  const requests = await db
    .select({ id: staffJoinRequests.id, name: staffJoinRequests.name, staffId: staffJoinRequests.staffId, role: staff.role, createdAt: staffJoinRequests.createdAt })
    .from(staffJoinRequests)
    .leftJoin(staff, eq(staff.id, staffJoinRequests.staffId))
    .where(and(eq(staffJoinRequests.eventId, ev.id), eq(staffJoinRequests.status, 'pending')))
    .orderBy(asc(staffJoinRequests.createdAt))
  const members = await db
    .select({ id: staff.id, username: staff.username, role: staff.role, isActive: staff.isActive })
    .from(staff)
    .where(eq(staff.eventId, ev.id))
    .orderBy(asc(staff.username))
  return {
    code: ev.joinCode,
    url: ev.joinCode ? `${baseUrl.replace(/\/+$/, '')}/staff/join/${ev.joinCode}` : null,
    pending: requests.map((r) => ({
      id: r.id,
      name: r.name,
      rejoin: r.staffId !== null,
      role: (r.role as 'waiter' | 'lead' | 'kitchen' | 'bar' | null) ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    members: members.map((m) => ({ ...m, role: m.role as 'waiter' | 'lead' | 'kitchen' | 'bar' })),
  }
}

// Let in (new account, or the known one again, active and with the chosen
// role) or turn away. Only pending requests of this event can be decided.
export async function decideJoin(db: Db, ev: Event, requestId: string, input: JoinDecision, adminId: string): Promise<void> {
  const req = (await db.select().from(staffJoinRequests)
    .where(and(eq(staffJoinRequests.id, requestId), eq(staffJoinRequests.eventId, ev.id))).limit(1))[0]
  if (!req) throw new AppError('NOT_FOUND', 404, 'Join request not found')
  if (req.status !== 'pending') throw new AppError('CONFLICT', 409, 'Join request was already decided')

  await db.transaction(async (tx) => {
    // Resolved again now: two people may have typed the same name at once, and
    // the first one let in owns it.
    let staffId = req.staffId ?? (await tx.select({ id: staff.id }).from(staff)
      .where(and(eq(staff.eventId, ev.id), sameName(staff.username, req.name))).limit(1))[0]?.id ?? null
    const known = staffId !== null
    if (input.decision === 'approve') {
      if (staffId) {
        await tx.update(staff).set({ role: input.role, isActive: true }).where(eq(staff.id, staffId))
      }
      else {
        staffId = (await tx.insert(staff)
          .values({ username: req.name, role: input.role, eventId: ev.id })
          .returning({ id: staff.id }))[0]!.id
      }
      await tx.insert(auditLog).values({
        action: known ? 'staff_update' : 'staff_create',
        staffId: adminId,
        targetKind: 'staff',
        targetId: staffId,
        payload: { joinedByLink: true, eventId: ev.id, role: input.role },
      })
    }
    await tx.update(staffJoinRequests)
      .set({ status: input.decision === 'approve' ? 'approved' : 'rejected', staffId, decidedAt: new Date() })
      .where(eq(staffJoinRequests.id, req.id))
  })
}
