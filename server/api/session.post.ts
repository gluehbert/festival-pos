import { defineEventHandler, readBody } from 'h3'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { events, guestSessions } from '../db/schema'
import { guestScans } from '../db/schema-service'
import { AppError, sendAppError } from '../lib/errors'
import { GUEST_SESSION_MS, setGuestCookie, signGuestSession } from '../lib/auth'
import { assertGuestPinAllowed, clientIp, recordGuestPinFailure } from '../lib/login-throttle'
import { isValidTableKey, safeEqual } from '../lib/table-key'
import { CreateGuestSessionSchema, GuestSessionSchema } from '../lib/contracts/guest'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const input = CreateGuestSessionSchema.parse(body)
    const db = getDb()

    const rows = input.eventId
      ? await db
          .select()
          .from(events)
          .where(and(eq(events.id, input.eventId), eq(events.isActive, true)))
          .limit(1)
      : await db.select().from(events).where(eq(events.isActive, true)).limit(1)

    const ev = rows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }
    if (input.tableNo < ev.tableRangeFrom || input.tableNo > ev.tableRangeTo) {
      throw new AppError(
        'VALIDATION',
        400,
        `Table number ${input.tableNo} is outside event range ${ev.tableRangeFrom}-${ev.tableRangeTo}`,
      )
    }

    const ip = clientIp(event)
    await assertGuestPinAllowed(db, ip)
    const authorized = input.key
      ? isValidTableKey(ev.id, input.tableNo, input.key)
      : safeEqual(ev.pinCode, input.pin ?? '')
    if (!authorized) {
      await recordGuestPinFailure(db, ip)
      throw new AppError('FORBIDDEN', 403, 'Invalid table code or event PIN')
    }

    const expiresAt = new Date(Date.now() + GUEST_SESSION_MS)
    const inserted = await db
      .insert(guestSessions)
      .values({ eventId: ev.id, tableNo: input.tableNo, expiresAt })
      .returning({ id: guestSessions.id })

    const sessionId = inserted[0]!.id
    // Usage report: rehearsal sign-ins are not guests.
    if (!ev.trialMode) {
      await db
        .insert(guestScans)
        .values({ eventId: ev.id, tableNo: input.tableNo, count: 1 })
        .onConflictDoUpdate({ target: [guestScans.eventId, guestScans.tableNo], set: { count: sql`${guestScans.count} + 1` } })
    }
    const token = await signGuestSession({ sessionId, eventId: ev.id, tableNo: input.tableNo })
    setGuestCookie(event, token)

    return GuestSessionSchema.parse({
      sessionId,
      eventId: ev.id,
      tableNo: input.tableNo,
      expiresAt: expiresAt.toISOString(),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
