import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { events } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../../lib/rbac'
import { parseTicketKey } from '../../../lib/tickets'
import { recordTableCheck } from '../../../lib/table-checks'
import { answerTableCalls } from '../../../lib/waiter-calls'
import { TableCheckResponseSchema } from '../../../lib/contracts/staff'

// The waiter asked at the table and nobody wanted anything: the overview then
// shows "Nachgefragt vor X Min." instead of the time since the last order.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, SERVICE_ROLES)
    const id = getRouterParam(event, 'id') ?? ''
    const parsed = parseTicketKey(id)
    if (!parsed || parsed.kind !== 'table') {
      throw new AppError('VALIDATION', 400, `Invalid table ticket key '${id}'`)
    }
    const db = getDb()
    const evRows = await db
      .select({ id: events.id, from: events.tableRangeFrom, to: events.tableRangeTo })
      .from(events)
      .where(eq(events.isActive, true))
      .limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }
    const tableNo = parsed.tableNo!
    if (tableNo < ev.from || tableNo > ev.to) {
      throw new AppError('VALIDATION', 400, `Table ${tableNo} is outside the event's table range`)
    }

    const checkedAt = await recordTableCheck(db, ev.id, tableNo, staff.staffId)
    await answerTableCalls(db, ev.id, tableNo, staff.staffId)
    return TableCheckResponseSchema.parse({ ticketKey: id, checkedAt: checkedAt.toISOString() })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
