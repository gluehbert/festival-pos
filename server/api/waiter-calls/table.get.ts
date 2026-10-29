import { defineEventHandler } from 'h3'
import { getDb } from '../../db/client'
import { AppError, sendAppError } from '../../lib/errors'
import { requireActiveEvent } from '../../lib/active-event'
import { loadTableCall } from '../../lib/waiter-calls'
import { TableCallSchema } from '../../lib/contracts/waiter-calls'

// Guest: has the table called, and is someone coming?
export default defineEventHandler(async (event) => {
  try {
    const guest = event.context.guest
    if (!guest) throw new AppError('UNAUTHORIZED', 401, 'Guest session required')
    const db = getDb()
    const ev = await requireActiveEvent(db)
    if (ev.id !== guest.eventId || !ev.waiterCallsEnabled) return null
    return TableCallSchema.parse(await loadTableCall(db, ev.id, guest.tableNo))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
