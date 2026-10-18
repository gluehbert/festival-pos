import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { PopularItemsSchema } from '../../lib/contracts/guest'
import { popularItems } from '../../lib/popular'

// GET /api/menu/popular[?table=N] – items for the "Popular" tab. Staff may ask
// for any table; a guest always gets their own table; anyone else only the
// event's best sellers.
export default defineEventHandler(async (event) => {
  try {
    const db = getDb()
    const ev = (await db.select().from(events).where(eq(events.isActive, true)).limit(1))[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }

    let tableNo: number | null = null
    const raw = getQuery(event).table
    if (event.context.auth?.staff && raw !== undefined && raw !== '') {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 1) throw new AppError('VALIDATION', 400, 'Invalid table number')
      tableNo = n
    }
    else if (event.context.guest?.eventId === ev.id) {
      tableNo = event.context.guest.tableNo
    }

    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return PopularItemsSchema.parse(await popularItems(db, ev.id, tableNo))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
