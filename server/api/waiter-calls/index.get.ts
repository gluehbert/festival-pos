import { defineEventHandler } from 'h3'
import { getDb } from '../../db/client'
import { sendAppError } from '../../lib/errors'
import { CALL_ROLES, requireRole } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { loadOpenCalls } from '../../lib/waiter-calls'
import { OpenCallsSchema } from '../../lib/contracts/waiter-calls'

// Open calls of the active event; each screen shows the ones meant for it.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, CALL_ROLES)
    const db = getDb()
    const ev = await requireActiveEvent(db)
    return OpenCallsSchema.parse({ calls: ev.waiterCallsEnabled ? await loadOpenCalls(db, ev.id) : [] })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
