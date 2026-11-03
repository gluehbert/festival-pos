import { defineEventHandler } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { loadStationBuzzers } from '../../../../lib/production-lanes'

// The buzzer keys of each station, in lane order.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const db = getDb()
    await loadEvent(db, id)
    return await loadStationBuzzers(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
