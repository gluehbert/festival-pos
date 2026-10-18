import { defineEventHandler, readBody } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { staff } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { ThemeSchema } from '../../lib/contracts/staff'

// Stores the signed-in staff member's colour scheme, so it follows them to
// every device they log in on. Any role may change its own preference.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = event.context.auth?.staff
    if (!me) {
      throw new AppError('UNAUTHORIZED', 401, 'No staff session')
    }
    const { theme } = ThemeSchema.parse(await readBody(event))
    await getDb().update(staff).set({ theme }).where(eq(staff.id, me.staffId))
    return ThemeSchema.parse({ theme })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
