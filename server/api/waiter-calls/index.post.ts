import { defineEventHandler, readBody } from 'h3'
import { getDb } from '../../db/client'
import { AppError, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { requireActiveEvent } from '../../lib/active-event'
import { createCall, requireWaiterCalls } from '../../lib/waiter-calls'
import { CreateWaiterCallSchema, TableCallSchema } from '../../lib/contracts/waiter-calls'

// A guest calls the service to their table, with a reason.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const guest = event.context.guest
    if (!guest) throw new AppError('UNAUTHORIZED', 401, 'Guest session required')
    const input = CreateWaiterCallSchema.parse(await readBody(event))
    const db = getDb()
    const ev = await requireActiveEvent(db)
    if (ev.id !== guest.eventId) throw new AppError('NOT_FOUND', 404, 'Active event not found')
    requireWaiterCalls(ev)
    return TableCallSchema.parse(await createCall(db, ev.id, guest.tableNo, input.reason))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
