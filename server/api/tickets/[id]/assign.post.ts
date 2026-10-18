import { defineEventHandler, readBody } from 'h3'
import { getDb } from '../../../db/client'
import { sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES, TABLE_LEAD_ROLES } from '../../../lib/rbac'
import { AssignTableResponseSchema, AssignTableSchema } from '../../../lib/contracts/tables'
import { assignTable, loadAssignee, requireTeamMember } from '../../../lib/table-assignments'
import { requireTableTarget } from '../../../lib/table-target'

// "My table": the waiter takes responsibility for the table. A table held
// by someone else needs { takeOver: true } after the waiter confirmed it.
// A shift lead hands the table to someone else with { staffId }.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, SERVICE_ROLES)
    const input = AssignTableSchema.parse((await readBody(event)) ?? {})
    const db = getDb()
    const { eventId, tableNo } = await requireTableTarget(event, db)
    const target = input.staffId ?? staff.staffId
    const handOut = target !== staff.staffId
    if (handOut) {
      requireRole(event, TABLE_LEAD_ROLES)
      await requireTeamMember(db, eventId, target)
    }
    await assignTable(db, eventId, tableNo, target, input.takeOver || handOut, staff.staffId)
    return AssignTableResponseSchema.parse({ tableNo, assignee: await loadAssignee(db, eventId, tableNo) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
