import { defineEventHandler, readBody } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { stationBuzzers } from '../../../../db/schema-service'
import { sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { loadStationBuzzers } from '../../../../lib/production-lanes'
import { SetStationBuzzersSchema } from '../../../../lib/contracts/production'
import { writeAudit } from '../../../../lib/audit'

// Replaces a station's buzzers with the given keys: lane 1 is the first key.
// A card in a lane that is gone goes back to "Next up" on the next poll.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const { station, keys } = SetStationBuzzersSchema.parse(await readBody(event))
    const db = getDb()
    await loadEvent(db, id)
    await db.transaction(async (tx) => {
      await tx.delete(stationBuzzers).where(and(eq(stationBuzzers.eventId, id), eq(stationBuzzers.station, station)))
      if (keys.length > 0) {
        await tx.insert(stationBuzzers).values(keys.map((key, i) => ({ eventId: id, station, lane: i + 1, key })))
      }
      await writeAudit(tx, {
        action: 'event_update',
        staffId: admin.staffId,
        targetKind: 'event',
        targetId: id,
        payload: { fields: ['buzzers'], station, buzzers: keys },
      })
    })
    return await loadStationBuzzers(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
