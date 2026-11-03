import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../db/client'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { CALL_ROLES, requireRole } from '../../../lib/rbac'
import { requireActiveEvent } from '../../../lib/active-event'
import { acknowledgeCall } from '../../../lib/waiter-calls'
import { OkSchema } from '../../../lib/contracts/staff'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "On my way" from a waiter, "passed on" from the bar: the call is answered
// and the guest sees that someone is coming.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, CALL_ROLES)
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid call id')
    const db = getDb()
    const ev = await requireActiveEvent(db)
    await acknowledgeCall(db, ev.id, id, staff.staffId)
    return OkSchema.parse({ ok: true })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
