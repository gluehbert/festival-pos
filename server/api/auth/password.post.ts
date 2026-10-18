import { defineEventHandler, readBody } from 'h3'
import bcrypt from 'bcryptjs'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { auditLog, staff } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { requireRole } from '../../lib/rbac'
import { BCRYPT_COST } from '../../lib/staff-admin'
import { setStaffCookie, signStaffJwt, type StaffRole } from '../../lib/auth'
import { assertLoginAllowed, clearLoginFailures, clientIp, recordLoginFailure } from '../../lib/login-throttle'
import { ChangePasswordSchema, OkSchema } from '../../lib/contracts/staff'

// "Mein Konto": an admin changes their own password. Service, kitchen and bar
// staff join an event by link and have no password to change. Wrong attempts
// count like failed logins, so a forgotten phone cannot be used to guess.
// Other devices are logged out; this one stays signed in.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireRole(event, ['admin'])
    const input = ChangePasswordSchema.parse(await readBody(event))
    const db = getDb()
    const ip = clientIp(event)
    await assertLoginAllowed(db, me.username, ip)

    const row = (await db.select().from(staff).where(eq(staff.id, me.staffId)).limit(1))[0]
    if (!row || !row.isActive) throw new AppError('UNAUTHORIZED', 401, 'No staff session')
    if (!row.passwordHash || !(await bcrypt.compare(input.current, row.passwordHash))) {
      await recordLoginFailure(db, me.username, ip)
      throw new AppError('WRONG_SECRET', 400, 'Current password is wrong')
    }
    await clearLoginFailures(db, me.username, ip)

    const passwordHash = await bcrypt.hash(input.next, BCRYPT_COST)
    const updated = await db.transaction(async (tx) => {
      const u = (await tx
        .update(staff)
        .set({ passwordHash, sessionVersion: sql`${staff.sessionVersion} + 1` })
        .where(eq(staff.id, me.staffId))
        .returning())[0]!
      await tx.insert(auditLog).values({
        action: 'staff_update',
        staffId: me.staffId,
        targetKind: 'staff',
        targetId: me.staffId,
        // Same shape as the admin form's entry; never the secret itself.
        payload: { passwordChanged: true, sessionsRevoked: true },
      })
      return u
    })
    setStaffCookie(event, await signStaffJwt({
      staffId: updated.id,
      role: updated.role as StaffRole,
      username: updated.username,
      sessionVersion: updated.sessionVersion,
    }))
    return OkSchema.parse({ ok: true })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
