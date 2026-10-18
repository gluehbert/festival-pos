import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import bcrypt from 'bcryptjs'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { staff } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { setStaffCookie, signStaffJwt, type StaffRole } from '../../lib/auth'
import { assertLoginAllowed, clearLoginFailures, clientIp, recordLoginFailure } from '../../lib/login-throttle'
import { StaffLoginSchema, StaffSessionSchema } from '../../lib/contracts/staff'

// bcrypt hash of a random string; compared against when the user does not exist.
const DUMMY_HASH = '$2b$10$hhoE8rxLiVXOHANuL6E5o./FrDa3ejnXviNY50Um5MUTcrxByPoBO'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const input = StaffLoginSchema.parse(body)

    const db = getDb()
    const ip = clientIp(event)
    await assertLoginAllowed(db, input.username, ip)

    const rows = await db
      .select()
      .from(staff)
      // Helpers who joined by link have no PIN or password.
      .where(and(eq(staff.username, input.username), isNull(staff.eventId)))
      .limit(1)
    const s = rows[0]
    // Admins log in with their password only: a 4-digit PIN is too weak for
    // an account that can change prices and staff (a PIN may be left over
    // from before a promotion).
    const pinHash = s?.role === 'admin' ? null : s?.pinHash ?? null
    const hash = s ? (input.kind === 'password' ? s.passwordHash : pinHash) : null

    // Always run bcrypt so unknown usernames are not distinguishable by timing.
    const ok = await bcrypt.compare(input.secret, hash ?? DUMMY_HASH)
    if (!s || !hash || !ok || !s.isActive) {
      await recordLoginFailure(db, input.username, ip)
      throw new AppError('UNAUTHORIZED', 401, 'Invalid credentials')
    }
    await clearLoginFailures(db, input.username, ip)

    const role = s.role as StaffRole
    const token = await signStaffJwt({ staffId: s.id, role, username: s.username, sessionVersion: s.sessionVersion })
    setStaffCookie(event, token)

    setResponseStatus(event, 200)
    return StaffSessionSchema.parse({
      staffId: s.id,
      username: s.username,
      role,
      theme: s.theme,
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
