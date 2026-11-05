import { defineEventHandler } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { loadSetup } from '../../../../lib/event-setup'

// The guided setup's ticks and facts, the same on every admin device.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const db = getDb()
    await loadEvent(db, id)
    return await loadSetup(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
