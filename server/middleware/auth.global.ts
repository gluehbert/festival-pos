import { createError, defineEventHandler, getCookie, setResponseHeader, type H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { events, staff } from '../db/schema'
import { cookieNames, verifyGuestSession, verifyStaffJwt, type GuestJwtPayload, type StaffJwtPayload, type StaffRole, type StaffTokenClaims } from '../lib/auth'
import { log } from '../lib/log'

declare module 'h3' {
  interface H3EventContext {
    auth?: { staff?: StaffJwtPayload }
    guest?: GuestJwtPayload
  }
}

// The JWT is valid for 12 h. For API calls the account is re-checked against
// the database so deactivated or demoted staff lose access immediately, and
// a token from before a PIN/password/role/active change (session_version)
// is no longer accepted. Helpers who joined by link only count while their
// event is the active one.
async function currentStaff(event: H3Event, claims: StaffTokenClaims): Promise<StaffJwtPayload | undefined> {
  if (!event.path.startsWith('/api/')) return claims
  let row
  try {
    row = (await getDb()
      .select({ role: staff.role, isActive: staff.isActive, username: staff.username, sessionVersion: staff.sessionVersion, eventId: staff.eventId, eventActive: events.isActive })
      .from(staff)
      .leftJoin(events, eq(events.id, staff.eventId))
      .where(eq(staff.id, claims.staffId))
      .limit(1))[0]
  }
  catch (err) {
    log.error('auth.staff_lookup_failed', {
      requestId: event.context.requestId as string | undefined,
      err: err instanceof Error ? err.message : String(err),
    })
    // The database is down, the session may be fine: 503 makes the client
    // retry instead of sending the user to the login.
    setResponseHeader(event, 'Retry-After', 2)
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      data: { code: 'DB_UNAVAILABLE', message: 'Database temporarily unavailable, please retry.', retryAfterSeconds: 2 },
    })
  }
  if (!row || !row.isActive || row.sessionVersion !== claims.sessionVersion) return undefined
  if (row.eventId && !row.eventActive) return undefined
  return { staffId: claims.staffId, role: row.role as StaffRole, username: row.username }
}

export default defineEventHandler(async (event) => {
  event.context.auth = {}

  const staffToken = getCookie(event, cookieNames.staff)
  if (staffToken) {
    let claims: StaffTokenClaims | undefined
    try {
      claims = await verifyStaffJwt(staffToken)
    }
    catch {
      // ignore invalid token; treat as unauthenticated
    }
    if (claims) event.context.auth.staff = await currentStaff(event, claims)
  }

  const guestToken = getCookie(event, cookieNames.guest)
  if (guestToken) {
    try {
      event.context.guest = await verifyGuestSession(guestToken)
    }
    catch {
      // ignore invalid token
    }
  }
})
