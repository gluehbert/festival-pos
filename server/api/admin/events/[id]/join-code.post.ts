import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { events } from '../../../../db/schema'
import { sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { newJoinCode } from '../../../../lib/staff-join'

// Creates the join link, or replaces it when it went round too widely: the
// old link stops working, people already let in stay signed in.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    requireRole(event, ['admin'])
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    const code = newJoinCode()
    await db.update(events).set({ joinCode: code }).where(eq(events.id, ev.id))
    return { code }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
