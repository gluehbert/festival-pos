import { defineEventHandler, readBody } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events, guestSessions } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { GUEST_SESSION_MS, setGuestCookie, setStaffCookie, signGuestSession, signStaffJwt, type StaffRole } from '../../lib/auth'
import { previewAccount, requirePreviewLogin } from '../../lib/preview-login'
import { ensurePreviewEvent } from '../../lib/preview-demo'
import { PreviewLoginResponseSchema, PreviewLoginSchema } from '../../lib/contracts/preview'

const HOME: Record<StaffRole, string> = { waiter: '/staff', lead: '/staff', kitchen: '/production', bar: '/production', cafe: '/production', admin: '/admin/events' }

// Preview deployments only: sign in as service, shift lead, kitchen, bar,
// admin or as a guest at a table with one tap (404 everywhere else).
export default defineEventHandler(async (event) => {
  try {
    requirePreviewLogin()
    assertCsrf(event)
    const input = PreviewLoginSchema.parse((await readBody(event)) ?? {})
    const db = getDb()
    await ensurePreviewEvent(db)

    if (input.as === 'guest') {
      const ev = (await db.select().from(events).where(eq(events.isActive, true)).limit(1))[0]
      if (!ev) throw new AppError('NOT_FOUND', 404, 'No active event')
      const tableNo = ev.tableRangeFrom
      const expiresAt = new Date(Date.now() + GUEST_SESSION_MS)
      const session = (await db.insert(guestSessions).values({ eventId: ev.id, tableNo, expiresAt }).returning({ id: guestSessions.id }))[0]!
      setGuestCookie(event, await signGuestSession({ sessionId: session.id, eventId: ev.id, tableNo }))
      return PreviewLoginResponseSchema.parse({ to: `/t/${tableNo}` })
    }

    const s = await previewAccount(db, input.as)
    const role = s.role as StaffRole
    setStaffCookie(event, await signStaffJwt({ staffId: s.id, role, username: s.username, sessionVersion: s.sessionVersion }))
    return PreviewLoginResponseSchema.parse({ to: HOME[role] })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
