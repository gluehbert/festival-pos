import { defineEventHandler } from 'h3'
import { getDb } from '../../db/client'
import { sendAppError } from '../../lib/errors'
import { requireRole, TABLE_LEAD_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { TeamSchema } from '../../lib/contracts/tables'
import { loadTeam } from '../../lib/table-assignments'

// "Tische verteilen": everyone the shift lead can hand tables to.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, TABLE_LEAD_ROLES)
    const db = getDb()
    const ev = await requireActiveEvent(db)
    return TeamSchema.parse({ team: await loadTeam(db, ev.id) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
