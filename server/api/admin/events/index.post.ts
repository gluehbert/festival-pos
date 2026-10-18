import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { getDb } from '../../../db/client'
import { events } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole } from '../../../lib/rbac'
import { CreateEventSchema } from '../../../lib/contracts/admin'
import { toEventDto } from '../../../lib/events'
import { writeAudit } from '../../../lib/audit'

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const body = await readBody(event)
    const input = CreateEventSchema.parse(body)

    const db = getDb()
    let created
    try {
      created = await db.transaction(async (tx) => {
        const row = (await tx
          .insert(events)
          .values({
            name: input.name,
            pinCode: input.pinCode,
            tableRangeFrom: input.tableRangeFrom,
            tableRangeTo: input.tableRangeTo,
            startsOn: input.startsOn ?? null,
            endsOn: input.endsOn ?? null,
            isActive: false,
          })
          .returning())[0]!
        // The guest PIN itself is not logged.
        await writeAudit(tx, {
          action: 'event_create',
          staffId: admin.staffId,
          targetKind: 'event',
          targetId: row.id,
          payload: { name: row.name, tableRangeFrom: row.tableRangeFrom, tableRangeTo: row.tableRangeTo, startsOn: row.startsOn, endsOn: row.endsOn },
        })
        return row
      })
    }
    catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
      if (msg.includes('unique') || msg.includes('duplicate')) {
        throw new AppError('CONFLICT', 409, 'pinCode already in use')
      }
      throw err
    }
    setResponseStatus(event, 201)
    return toEventDto(created, 0)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
