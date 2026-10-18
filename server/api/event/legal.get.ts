import { defineEventHandler, setResponseHeader } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events } from '../../db/schema'
import { sendAppError } from '../../lib/errors'
import { LegalTextsSchema } from '../../lib/contracts/branding'

// Public: Impressum and Datenschutz of the active event, as plain text.
export default defineEventHandler(async (event) => {
  try {
    const ev = (await getDb()
      .select({ name: events.name, imprintText: events.imprintText, privacyText: events.privacyText })
      .from(events)
      .where(eq(events.isActive, true))
      .limit(1))[0]
    setResponseHeader(event, 'Cache-Control', 'public, s-maxage=60')
    return LegalTextsSchema.parse({
      eventName: ev?.name ?? null,
      imprintText: ev?.imprintText ?? null,
      privacyText: ev?.privacyText ?? null,
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
