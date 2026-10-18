import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { staff as staffTable } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { StaffSessionSchema } from '../../lib/contracts/staff'

export default defineEventHandler(async (event) => {
  try {
    const staff = event.context.auth?.staff
    if (!staff) {
      throw new AppError('UNAUTHORIZED', 401, 'No staff session')
    }
    const row = (await getDb()
      .select({ theme: staffTable.theme })
      .from(staffTable)
      .where(eq(staffTable.id, staff.staffId))
      .limit(1))[0]
    return StaffSessionSchema.parse({
      staffId: staff.staffId,
      username: staff.username,
      role: staff.role,
      theme: row?.theme ?? 'system',
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
