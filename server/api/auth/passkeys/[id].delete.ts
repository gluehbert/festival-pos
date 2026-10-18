import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../db/client'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireStaff } from '../../../lib/rbac'
import { OkSchema } from '../../../lib/contracts/staff'
import { UUID_RE, removePasskey } from '../../../lib/passkeys'

// Removes one of the signed-in staff member's own passkeys.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireStaff(event)
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid passkey id')
    await removePasskey(getDb(), { passkeyId: id, ownerId: me.staffId, actorId: me.staffId, revokeSessions: false })
    return OkSchema.parse({ ok: true })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
