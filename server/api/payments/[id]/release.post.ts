import { defineEventHandler, getRouterParam } from 'h3'
import { and, eq, lt, or } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { paymentLocks } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../../lib/rbac'
import { OkSchema } from '../../../lib/contracts/staff'

const UUID_RE = /^[0-9a-f-]{36}$/i

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, SERVICE_ROLES)
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) {
      throw new AppError('VALIDATION', 400, 'Invalid lock id')
    }
    const db = getDb()
    await db
      .delete(paymentLocks)
      .where(
        and(
          eq(paymentLocks.id, id),
          or(eq(paymentLocks.staffId, staff.staffId), lt(paymentLocks.expiresAt, new Date())),
        ),
      )
    return OkSchema.parse({ ok: true })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
