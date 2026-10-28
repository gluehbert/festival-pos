import { defineEventHandler, readBody } from 'h3'
import { and, eq, gt, lt, or } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { events } from '../../../../db/schema'
import { tableAssignments, tableChecks } from '../../../../db/schema-service'
import { AppError, sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { TableRangeSchema } from '../../../../lib/contracts/admin'
import { eventIdParam, loadEvent, loadEventDto } from '../../../../lib/events'
import { loadEndCheck } from '../../../../lib/event-end'
import { diffFields, writeAudit } from '../../../../lib/audit'

// Changes which table numbers the event has, also while it is live. A table
// with an open bill cannot be removed; assignments and checks of removed
// tables go away with them.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const { tableRangeFrom, tableRangeTo } = TableRangeSchema.parse(await readBody(event))

    const db = getDb()
    const before = await loadEvent(db, id)
    const outside = (n: number) => n < tableRangeFrom || n > tableRangeTo
    const blocked = (await loadEndCheck(db, id)).openTables.tableNos.filter(outside)
    if (blocked.length > 0) {
      throw new AppError('TABLES_OPEN', 409, `Tables with open bills: ${blocked.join(', ')}`, { tableNos: blocked })
    }

    await db.transaction(async (tx) => {
      await tx.update(events).set({ tableRangeFrom, tableRangeTo }).where(eq(events.id, id))
      const removed = (t: typeof tableChecks | typeof tableAssignments) =>
        and(eq(t.eventId, id), or(lt(t.tableNo, tableRangeFrom), gt(t.tableNo, tableRangeTo)))
      await tx.delete(tableChecks).where(removed(tableChecks))
      await tx.delete(tableAssignments).where(removed(tableAssignments))
      await writeAudit(tx, {
        action: 'event_update',
        staffId: admin.staffId,
        targetKind: 'event',
        targetId: id,
        payload: diffFields(before, { tableRangeFrom, tableRangeTo }),
      })
    })
    return await loadEventDto(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
