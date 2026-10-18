import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { getDb } from '../../db/client'
import { auditLog } from '../../db/schema'
import { cashSessions } from '../../db/schema-cash'
import { AppError, isUniqueViolation, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { toCashSessionDto } from '../../lib/cash-sessions'
import { CashSessionSchema, OpenCashSessionSchema } from '../../lib/contracts/cash'

// Opens the caller's cash drawer with the change float (Wechselgeld).
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireRole(event, SERVICE_ROLES)
    const input = OpenCashSessionSchema.parse(await readBody(event))
    const db = getDb()
    const ev = await requireActiveEvent(db)
    try {
      const row = await db.transaction(async (tx) => {
        const [s] = await tx
          .insert(cashSessions)
          .values({ eventId: ev.id, staffId: me.staffId, openingCents: input.openingCents })
          .returning()
        await tx.insert(auditLog).values({
          action: 'cash_open',
          staffId: me.staffId,
          targetKind: 'cash_session',
          targetId: s!.id,
          payload: { openingCents: input.openingCents },
        })
        return s!
      })
      setResponseStatus(event, 201)
      return CashSessionSchema.parse(await toCashSessionDto(db, row, me.username))
    }
    catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 409, 'Cash drawer is already open')
      throw err
    }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
