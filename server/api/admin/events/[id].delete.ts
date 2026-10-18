import { defineEventHandler } from 'h3'
import { getDb } from '../../../db/client'
import { sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole } from '../../../lib/rbac'
import { log } from '../../../lib/log'
import { eventIdParam } from '../../../lib/events'
import { deleteEvent } from '../../../lib/event-end'

// Deletes an ended event for good (orders, payments, drawers, helper accounts).
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const deleted = await deleteEvent(getDb(), id, staff.staffId)
    log.info('event.deleted', {
      requestId: event.context.requestId as string | undefined,
      userId: staff.staffId,
      route: 'DELETE /api/admin/events/:id',
      eventId: id,
      ...deleted,
    })
    return { deleted: true as const, ...deleted }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
