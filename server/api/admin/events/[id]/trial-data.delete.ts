import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../../db/client'
import { AppError, sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { log } from '../../../../lib/log'
import { TrialResetSchema } from '../../../../lib/contracts/admin'
import { deleteTrialData, loadEventDto } from '../../../../lib/events'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Deletes the orders and payments recorded while the event was in rehearsal
// mode. Real orders are never touched.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID.test(id)) throw new AppError('VALIDATION', 400, 'Invalid event id')

    const db = getDb()
    await loadEventDto(db, id) // 404 for unknown events
    const deleted = await deleteTrialData(db, id, staff.staffId)
    log.info('event.trial_data_deleted', {
      requestId: event.context.requestId as string | undefined,
      userId: staff.staffId,
      route: 'DELETE /api/admin/events/:id/trial-data',
      eventId: id,
      ...deleted,
    })
    return TrialResetSchema.parse({
      deletedOrders: deleted.orders,
      deletedPayments: deleted.payments,
      event: await loadEventDto(db, id),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
