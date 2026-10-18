import { defineEventHandler } from 'h3'
import { desc, sql } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { events } from '../../../db/schema'
import { sendAppError } from '../../../lib/errors'
import { requireRole } from '../../../lib/rbac'
import { EventsListSchema } from '../../../lib/contracts/admin'
import { toEventDto, trialOrderCounts } from '../../../lib/events'

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const db = getDb()
    // Upcoming/most recent event date first; undated events by creation.
    const rows = await db
      .select()
      .from(events)
      .orderBy(sql`${events.startsOn} DESC NULLS LAST`, desc(events.createdAt))
    const counts = await trialOrderCounts(db, rows.map((r) => r.id))
    return EventsListSchema.parse({
      events: rows.map((r) => toEventDto(r, counts.get(r.id) ?? 0)),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
