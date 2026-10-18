import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../../../db/client'
import { AppError, sendAppError } from '../../../../../lib/errors'
import { assertCsrf } from '../../../../../lib/csrf'
import { requireRole } from '../../../../../lib/rbac'
import { setStaffCookie, signStaffJwt, type StaffRole } from '../../../../../lib/auth'
import { OkSchema } from '../../../../../lib/contracts/staff'
import { UUID_RE, removePasskey } from '../../../../../lib/passkeys'

// An admin removes a passkey, typically for a lost phone. That phone may still
// hold a session, so all sessions of the account end (session_version).
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const staffId = getRouterParam(event, 'id') ?? ''
    const passkeyId = getRouterParam(event, 'passkeyId') ?? ''
    if (!UUID_RE.test(staffId) || !UUID_RE.test(passkeyId)) throw new AppError('VALIDATION', 400, 'Invalid id')
    const owner = await removePasskey(getDb(), { passkeyId, ownerId: staffId, actorId: admin.staffId, revokeSessions: true })
    // The admin removing their own passkey stays logged in on this device.
    if (staffId === admin.staffId) {
      setStaffCookie(event, await signStaffJwt({ staffId, role: owner.role as StaffRole, username: owner.username, sessionVersion: owner.sessionVersion }))
    }
    return OkSchema.parse({ ok: true })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
