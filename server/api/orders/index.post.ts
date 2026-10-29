import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { requireRole, SERVICE_ROLES, SERVING_ROLES } from '../../lib/rbac'
import { getIdempotencyKey } from '../../lib/idempotency'
import { log } from '../../lib/log'
import { assertGuestOrderAllowed } from '../../lib/guest-order-limit'
import { CreateOrderSchema, OrderSchema } from '../../lib/contracts/guest'
import { createOrderRow, loadOrderResponse, reuseExisting } from '../../lib/order-create'
import { claimIfFree } from '../../lib/table-assignments'
import { answerTableCalls } from '../../lib/waiter-calls'

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const body = await readBody(event)
    const input = CreateOrderSchema.parse(body)

    const db = getDb()
    const evRows = await db
      .select()
      .from(events)
      .where(eq(events.isActive, true))
      .limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'Active event not found')
    }

    const key = getIdempotencyKey(event)

    const staffMode = input.mode ?? (input.createWalkin ? 'walkin' : null)
    if (staffMode) {
      const staff = requireRole(event, SERVICE_ROLES)
      if (staffMode === 'staff_meal' && !ev.staffMealsEnabled) {
        throw new AppError('CONFLICT', 409, 'Staff meals are switched off for this event')
      }
      const isWalkin = staffMode !== 'staff_table'
      // Staff meals belong to no table.
      const tableNo = staffMode === 'staff_meal' ? 0 : input.tableNo
      // Any table number is fine, also tables without a QR code.
      if (!isWalkin && tableNo < 1) {
        throw new AppError('VALIDATION', 400, 'tableNo must be >= 1')
      }

      const reusedId = key ? await reuseExisting(db, ev.id, { staffId: staff.staffId }, key) : null
      const orderId = reusedId ?? await createOrderRow(
        db,
        ev,
        input,
        { kind: staffMode, guestSessionId: null, createdByStaff: staff.staffId, tableNo, staffMealReason: input.staffMealReason },
        key,
      )
      // Taking an order at a free table makes the waiter responsible; a held
      // table stays with its waiter. Admins helping out never claim tables.
      if (!reusedId && !isWalkin && SERVING_ROLES.includes(staff.role)) await claimIfFree(db, ev.id, tableNo, staff.staffId)
      // The waiter is at the table: a call from it is answered.
      if (!reusedId && !isWalkin) await answerTableCalls(db, ev.id, tableNo, staff.staffId)
      const response = await loadOrderResponse(db, orderId, ev.id, tableNo, isWalkin)
      setResponseStatus(event, reusedId ? 200 : 201)
      if (!reusedId) {
        log.info('order.created', {
          requestId: event.context.requestId as string | undefined,
          userId: staff.staffId,
          route: 'POST /api/orders',
          kind: staffMode,
          orderId,
          tableNo,
        })
      }
      return OrderSchema.parse(response)
    }

    const guest = event.context.guest
    if (!guest) {
      throw new AppError('UNAUTHORIZED', 401, 'Guest session required')
    }
    if (input.tableNo < 1) {
      throw new AppError('VALIDATION', 400, 'tableNo must be >= 1')
    }
    if (input.tableNo !== guest.tableNo) {
      throw new AppError('FORBIDDEN', 403, 'Cannot order for a different table')
    }
    if (ev.id !== guest.eventId) {
      throw new AppError('NOT_FOUND', 404, 'Active event not found')
    }

    const reusedId = key ? await reuseExisting(db, ev.id, { guestSessionId: guest.sessionId }, key) : null
    if (reusedId) {
      const reused = await loadOrderResponse(db, reusedId, ev.id, guest.tableNo, false)
      setResponseStatus(event, 200)
      return OrderSchema.parse(reused)
    }

    await assertGuestOrderAllowed(db, ev.id, guest.tableNo, input)
    const orderId = await createOrderRow(
      db,
      ev,
      input,
      { kind: 'guest', guestSessionId: guest.sessionId, createdByStaff: null, tableNo: guest.tableNo },
      key,
    )
    const response = await loadOrderResponse(db, orderId, ev.id, guest.tableNo, false)
    setResponseStatus(event, 201)
    log.info('order.created', {
      requestId: event.context.requestId as string | undefined,
      route: 'POST /api/orders',
      kind: 'guest',
      orderId,
      tableNo: guest.tableNo,
    })
    return OrderSchema.parse(response)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
