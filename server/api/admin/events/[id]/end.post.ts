import { defineEventHandler } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { log } from '../../../../lib/log'
import { eventIdParam, loadEventDto } from '../../../../lib/events'
import { endEvent } from '../../../../lib/event-end'

// Ends the live event. Open items do not block: the admin has seen the
// check list, and what was open is kept in the audit log.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const db = getDb()
    const check = await endEvent(db, id, staff.staffId)
    log.info('event.ended', {
      requestId: event.context.requestId as string | undefined,
      userId: staff.staffId,
      route: 'POST /api/admin/events/:id/end',
      eventId: id,
      openTables: check.openTables.count,
      openCashSessions: check.openCashSessions.length,
    })
    return await loadEventDto(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
