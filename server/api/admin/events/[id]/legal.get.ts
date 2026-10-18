import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { events } from '../../../../db/schema'
import { AppError, sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam } from '../../../../lib/events'
import { LegalTextsSchema } from '../../../../lib/contracts/branding'

// Impressum and Datenschutz of any event, for editing; saved via the branding PATCH.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const ev = (await getDb()
      .select({ name: events.name, imprintText: events.imprintText, privacyText: events.privacyText })
      .from(events)
      .where(eq(events.id, id))
      .limit(1))[0]
    if (!ev) throw new AppError('NOT_FOUND', 404, 'Event not found')
    return LegalTextsSchema.parse({ eventName: ev.name, imprintText: ev.imprintText, privacyText: ev.privacyText })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
