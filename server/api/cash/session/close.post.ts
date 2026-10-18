import { defineEventHandler, readBody } from 'h3'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { auditLog } from '../../../db/schema'
import { cashSessions } from '../../../db/schema-cash'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../../lib/rbac'
import { cashFlows, expectedFrom, findOpenSessionAnyEvent, toCashSessionDto } from '../../../lib/cash-sessions'
import { CashSessionSchema, CloseCashSessionSchema } from '../../../lib/contracts/cash'

// Kassenabschluss: the waiter enters the counted cash; the expected amount
// is frozen and the difference shown.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireRole(event, SERVICE_ROLES)
    const input = CloseCashSessionSchema.parse(await readBody(event))
    const db = getDb()
    // Also drawers left open at an ended event; the Soll stays per event.
    const open = (await findOpenSessionAnyEvent(db, me.staffId))?.session
    if (!open) throw new AppError('NOT_FOUND', 404, 'No open cash drawer')

    const closed = await db.transaction(async (tx) => {
      // One clock for payments, refunds and the close: the app server's clock
      // may differ by seconds and would drop or add late bookings.
      const clock = await tx.execute(sql`SELECT now() AS now`) as unknown as { rows: Array<{ now: Date | string }> }
      const closedAt = new Date(clock.rows[0]!.now)
      const flows = await cashFlows(tx, open, closedAt)
      const expectedCents = expectedFrom(open.openingCents, flows)
      const [row] = await tx
        .update(cashSessions)
        .set({ closedAt, expectedCents, countedCents: input.countedCents, note: input.note || null })
        .where(and(eq(cashSessions.id, open.id), isNull(cashSessions.closedAt)))
        .returning()
      if (!row) throw new AppError('CONFLICT', 409, 'Cash drawer was closed meanwhile')
      await tx.insert(auditLog).values({
        action: 'cash_close',
        staffId: me.staffId,
        targetKind: 'cash_session',
        targetId: row.id,
        reason: input.note || null,
        payload: {
          openingCents: open.openingCents,
          ...flows,
          expectedCents,
          countedCents: input.countedCents,
          differenceCents: input.countedCents - expectedCents,
        },
      })
      return row
    })
    return CashSessionSchema.parse(await toCashSessionDto(db, closed, me.username))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
