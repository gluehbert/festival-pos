import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { auditLog, menuItems } from '../../db/schema'
import { depositReturns } from '../../db/schema-cash'
import { AppError, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import { requireActiveEvent } from '../../lib/active-event'
import { log } from '../../lib/log'
import { CreateDepositReturnSchema, DepositReturnSchema } from '../../lib/contracts/deposit'

// Deposit return: the waiter pays the deposit back for returned glasses. Only
// deposit values that exist on the menu can be booked.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireRole(event, SERVICE_ROLES)
    const input = CreateDepositReturnSchema.parse(await readBody(event))
    const db = getDb()
    const ev = await requireActiveEvent(db)
    if (!ev.depositEnabled) throw new AppError('CONFLICT', 409, 'Pfand is switched off for this event')
    const known = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.eventId, ev.id), eq(menuItems.depositCents, input.unitCents)))
      .limit(1)
    if (known.length === 0) throw new AppError('VALIDATION', 400, 'No menu item has this deposit value')

    const amountCents = -(input.unitCents * input.quantity)
    const row = await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(depositReturns)
        .values({ eventId: ev.id, staffId: me.staffId, unitCents: input.unitCents, quantity: input.quantity, amountCents, isTrial: ev.trialMode })
        .returning()
      await tx.insert(auditLog).values({
        action: 'deposit_return',
        staffId: me.staffId,
        targetKind: 'deposit_return',
        targetId: r!.id,
        payload: { unitCents: input.unitCents, quantity: input.quantity, amountCents, isTrial: ev.trialMode },
      })
      return r!
    })
    log.info('deposit.returned', {
      requestId: event.context.requestId as string | undefined,
      userId: me.staffId,
      route: 'POST /api/deposit-returns',
      amountCents,
    })
    setResponseStatus(event, 201)
    return DepositReturnSchema.parse({
      id: row.id,
      unitCents: row.unitCents,
      quantity: row.quantity,
      amountCents: row.amountCents,
      createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
