import { defineEventHandler, readBody } from 'h3'
import { and, eq, lt } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { stationBuzzers, stationLaneSettings } from '../../../../db/schema-service'
import { sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { loadStationBuzzers } from '../../../../lib/production-lanes'
import { SetStationBuzzersSchema } from '../../../../lib/contracts/production'
import { writeAudit } from '../../../../lib/audit'

// Replaces a station's buzzers with the given keys (and colours): lane 1 is
// the first key.
// A card in a lane that is gone goes back to "Next up" on the next poll.
// The station's own lane count (+/- on its screen) grows to the buzzers.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const { station, keys, colors } = SetStationBuzzersSchema.parse(await readBody(event))
    const db = getDb()
    await loadEvent(db, id)
    await db.transaction(async (tx) => {
      await tx.delete(stationBuzzers).where(and(eq(stationBuzzers.eventId, id), eq(stationBuzzers.station, station)))
      if (keys.length > 0) {
        await tx.insert(stationBuzzers).values(keys.map((key, i) => ({ eventId: id, station, lane: i + 1, key, color: colors?.[i] ?? null })))
        // A new buzzer brings its lane, even if the station set fewer lanes.
        await tx.update(stationLaneSettings).set({ laneCount: keys.length }).where(and(
          eq(stationLaneSettings.eventId, id),
          eq(stationLaneSettings.station, station),
          lt(stationLaneSettings.laneCount, keys.length),
        ))
      }
      await writeAudit(tx, {
        action: 'event_update',
        staffId: admin.staffId,
        targetKind: 'event',
        targetId: id,
        payload: { fields: ['buzzers'], station, buzzers: keys, ...(colors ? { colors } : {}) },
      })
    })
    return await loadStationBuzzers(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
