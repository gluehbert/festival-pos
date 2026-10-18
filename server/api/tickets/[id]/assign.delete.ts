import { defineEventHandler } from 'h3'
import { getDb } from '../../../db/client'
import { sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../../lib/rbac'
import { AssignTableResponseSchema } from '../../../lib/contracts/tables'
import { loadAssignee, releaseTable } from '../../../lib/table-assignments'
import { requireTableTarget } from '../../../lib/table-target'

// Gives the table back ("release table"). Shift leads and admins may free any table.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, SERVICE_ROLES)
    const db = getDb()
    const { eventId, tableNo } = await requireTableTarget(event, db)
    await releaseTable(db, eventId, tableNo, staff)
    return AssignTableResponseSchema.parse({ tableNo, assignee: await loadAssignee(db, eventId, tableNo) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
