import { defineEventHandler } from 'h3'
import { getDb } from '../../../db/client'
import { sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, TABLE_LEAD_ROLES } from '../../../lib/rbac'
import { requireActiveEvent } from '../../../lib/active-event'
import { endGuestSessions } from '../../../lib/guest-session'
import { EndGuestSessionsResponseSchema } from '../../../lib/contracts/tables'

// The shift lead ends the shift: phones that scanned a table QR code earlier
// can no longer order until they scan it again at the table.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, TABLE_LEAD_ROLES)
    const db = getDb()
    const ev = await requireActiveEvent(db)
    const ended = await endGuestSessions(db, ev.id, staff.staffId)
    return EndGuestSessionsResponseSchema.parse({ ended })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
