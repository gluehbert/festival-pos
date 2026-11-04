import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events } from '../../db/schema'
import { sendAppError } from '../../lib/errors'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { findOpenSessionAnyEvent, toCashSessionDto } from '../../lib/cash-sessions'
import { CurrentCashSessionSchema } from '../../lib/contracts/cash'

// The caller's open cash drawer with its live expected amount, if any. A
// drawer left open at an ended event is returned too, so it can be closed.
export default defineEventHandler(async (event) => {
  try {
    const me = requireRole(event, SERVICE_ROLES)
    const db = getDb()
    const open = await findOpenSessionAnyEvent(db, me.staffId)
    if (!open) {
      const ev = await requireActiveEvent(db) // 404 when nothing is live
      return CurrentCashSessionSchema.parse({ session: null, otherEventName: null, required: ev.cashDrawerEnabled })
    }
    const [live] = await db.select({ on: events.cashDrawerEnabled }).from(events).where(eq(events.isActive, true)).limit(1)
    return CurrentCashSessionSchema.parse({
      session: await toCashSessionDto(db, open.session, me.username),
      otherEventName: open.otherEventName,
      required: live?.on ?? false,
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
