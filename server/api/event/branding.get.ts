import { defineEventHandler, setResponseHeader } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events } from '../../db/schema'
import { sendAppError } from '../../lib/errors'
import { loadBranding } from '../../lib/branding'
import { EMPTY_BRANDING } from '../../lib/contracts/branding'

// Public: name, colour, logo, greeting, programme and flyer of the active
// event, so guests can see they are on the right page.
export default defineEventHandler(async (event) => {
  try {
    const db = getDb()
    const ev = (await db.select({ id: events.id }).from(events).where(eq(events.isActive, true)).limit(1))[0]
    // Not cached: the rehearsal banner and changed branding must show up
    // immediately. The query is cheap; images are cached via their own URLs.
    setResponseHeader(event, 'Cache-Control', 'no-cache')
    return ev ? await loadBranding(db, ev.id) : EMPTY_BRANDING
  }
  catch (err) {
    sendAppError(event, err)
  }
})
