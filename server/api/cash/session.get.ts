import { defineEventHandler } from 'h3'
import { getDb } from '../../db/client'
import { sendAppError } from '../../lib/errors'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { findOpenSession, toCashSessionDto } from '../../lib/cash-sessions'
import { CurrentCashSessionSchema } from '../../lib/contracts/cash'

// The caller's open cash drawer with its live expected amount, if any.
export default defineEventHandler(async (event) => {
  try {
    const me = requireRole(event, SERVICE_ROLES)
    const db = getDb()
    const ev = await requireActiveEvent(db)
    const open = await findOpenSession(db, ev.id, me.staffId)
    return CurrentCashSessionSchema.parse({
      session: open ? await toCashSessionDto(db, open, me.username) : null,
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
