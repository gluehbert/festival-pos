import { defineEventHandler } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { JoinOverviewSchema } from '../../../../lib/contracts/join'
import { joinOverview } from '../../../../lib/staff-join'
import { publicBaseUrl } from '../../../../lib/public-url'

// Join link, waiting room and the helpers who joined this event.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    return JoinOverviewSchema.parse(await joinOverview(db, ev, publicBaseUrl(event)))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
