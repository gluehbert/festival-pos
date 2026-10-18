import { defineEventHandler, setResponseHeader } from 'h3'
import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events, menuItems } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { MenuSchema } from '../../lib/contracts/guest'
import { toMenuItemDto } from '../../lib/menu-dto'
import { loadPricingRules, priceItems } from '../../lib/price-rules'

export default defineEventHandler(async (event) => {
  try {
    const db = getDb()
    const evRows = await db.select().from(events).where(eq(events.isActive, true)).limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }

    const items = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.eventId, ev.id), eq(menuItems.isAvailable, true)))
      .orderBy(asc(menuItems.sortOrder))

    // Prices right now: a running Happy Hour lowers priceCents and names
    // itself in promo (with its end); the order route prices again.
    const prices = priceItems(items, await loadPricingRules(db, ev.id), new Date())

    setResponseHeader(event, 'Cache-Control', 'public, s-maxage=5')

    return MenuSchema.parse({
      eventId: ev.id,
      // Without Pfand for the event no deposit is shown (nor charged).
      items: items.map((m) => ({ ...toMenuItemDto(m, prices.get(m.id)), ...(ev.depositEnabled ? {} : { depositCents: 0 }) })),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
