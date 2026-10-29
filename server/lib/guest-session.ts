import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { guestSessions } from '../db/schema'
import type { GuestJwtPayload } from './auth'
import { writeAudit } from './audit'
import { AppError } from './errors'

// The cookie alone is not enough: the session row must still be running.
// It ends after GUEST_SESSION_MS or when the shift lead ends the shift.
export async function assertLiveGuestSession(db: Db, guest: GuestJwtPayload): Promise<void> {
  const [row] = await db
    .select({ id: guestSessions.id })
    .from(guestSessions)
    .where(and(eq(guestSessions.id, guest.sessionId), gt(guestSessions.expiresAt, new Date())))
    .limit(1)
  if (!row) throw new AppError('UNAUTHORIZED', 401, 'Guest session expired, please scan the table QR code again')
}

// "Shift over": every guest phone of the event has to scan the table QR code
// again before it can order. Orders and bills stay as they are.
export async function endGuestSessions(db: Db, eventId: string, staffId: string): Promise<number> {
  return await db.transaction(async (tx) => {
    const ended = await tx
      .update(guestSessions)
      .set({ expiresAt: new Date() })
      .where(and(eq(guestSessions.eventId, eventId), gt(guestSessions.expiresAt, new Date())))
      .returning({ id: guestSessions.id })
    await writeAudit(tx, {
      action: 'guest_sessions_end',
      staffId,
      targetKind: 'event',
      targetId: eventId,
      payload: { sessions: ended.length },
    })
    return ended.length
  })
}
