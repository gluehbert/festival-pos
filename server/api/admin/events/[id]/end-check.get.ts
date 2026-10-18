import { defineEventHandler } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { loadEndCheck } from '../../../../lib/event-end'

// What is still open at the event: tables, cash drawers, undelivered items.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const db = getDb()
    await loadEvent(db, id)
    return await loadEndCheck(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
