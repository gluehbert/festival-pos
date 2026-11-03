import { defineEventHandler, readBody } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events } from '../../db/schema'
import { sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { requireRole } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { writeAudit } from '../../lib/audit'
import { CafeClosedSchema } from '../../lib/contracts/production'

// The cafe counter closes after the Kaffeeklatsch (or opens again); while it
// is closed, new orders of coffee and cake go to the kitchen.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['cafe', 'admin'])
    const input = CafeClosedSchema.parse(await readBody(event))
    const db = getDb()
    const ev = await requireActiveEvent(db)
    if (ev.cafeClosed !== input.closed) {
      await db.transaction(async (tx) => {
        await tx.update(events).set({ cafeClosed: input.closed }).where(eq(events.id, ev.id))
        await writeAudit(tx, {
          action: 'event_update',
          staffId: staff.staffId,
          targetKind: 'event',
          targetId: ev.id,
          payload: { fields: ['cafeClosed'], cafeClosed: input.closed },
        })
      })
    }
    return CafeClosedSchema.parse({ closed: input.closed })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
