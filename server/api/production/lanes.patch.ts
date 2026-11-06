import { defineEventHandler, readBody } from 'h3'
import { getDb } from '../../db/client'
import { AppError, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { isStationRole, requireRole, STATION_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { changeLanes } from '../../lib/production-lanes'
import { ProductionLanesPatchSchema, ProductionLanesSettingSchema } from '../../lib/contracts/production'

// The people at a station set how many work side by side (+/- in the display
// menu) or pause their lane. It holds for every screen of the station.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, [...STATION_ROLES, 'admin'])
    const input = ProductionLanesPatchSchema.parse(await readBody(event))
    const station = isStationRole(staff.role) ? staff.role : input.station
    if (!station) throw new AppError('VALIDATION', 400, 'station required for admin')
    const db = getDb()
    const ev = await requireActiveEvent(db)
    const change = 'laneCount' in input ? { laneCount: input.laneCount } : { lane: input.lane, paused: input.paused }
    return ProductionLanesSettingSchema.parse(await changeLanes(db, ev.id, station, change))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
