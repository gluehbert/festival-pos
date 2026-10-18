import { defineEventHandler } from 'h3'
import { asc, isNull } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { staff } from '../../../db/schema'
import { sendAppError } from '../../../lib/errors'
import { requireRole } from '../../../lib/rbac'
import { StaffListSchema } from '../../../lib/contracts/staff-admin'
import { toStaffDto } from '../../../lib/staff-admin'

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    // Permanent staff only; helpers who joined by link are listed per event.
    const rows = await getDb().select().from(staff).where(isNull(staff.eventId)).orderBy(asc(staff.username))
    return StaffListSchema.parse({ staff: rows.map(toStaffDto) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
