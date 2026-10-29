import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../db/client'
import {
  auditLog,
  events,
  orderItems,
  orders,
  paymentItems,
  payments,
} from '../../db/schema'
import { AppError, isUniqueViolation, sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import { log } from '../../lib/log'
import { getIdempotencyKey } from '../../lib/idempotency'
import {
  CreatePaymentSchema,
  PaymentResponseSchema,
} from '../../lib/contracts/staff'
import { parseTicketKey } from '../../lib/tickets'
import { buildSettleLines, settleLines } from '../../lib/payment-settle'
import { acquirePaymentLock, releasePaymentLock } from '../../lib/payment-lock'
import { findBookedPayment, ticketStatusAfter } from '../../lib/payment-replay'
import { loadReceipt } from '../../lib/receipt'
import { answerTableCalls } from '../../lib/waiter-calls'

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, SERVICE_ROLES)
    const body = await readBody(event)
    const input = CreatePaymentSchema.parse(body)
    const parsed = parseTicketKey(input.ticketKey)
    if (!parsed) {
      throw new AppError('VALIDATION', 400, `Invalid ticket key '${input.ticketKey}'`)
    }

    const db = getDb()

    const evRows = await db.select().from(events).where(eq(events.isActive, true)).limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }
    const ticketRef = parsed.kind === 'walkin'
      ? { walkOrderId: parsed.orderId! }
      : { tableNo: parsed.tableNo! }

    // A retry of a payment whose response got lost: answer with the booked
    // payment. Checked first, because its items now read as paid.
    const key = getIdempotencyKey(event)
    const replay = async (booked: { id: string; totalCents: number; tipCents: number }) => {
      setResponseStatus(event, 200)
      return PaymentResponseSchema.parse({
        paymentId: booked.id,
        totalCents: booked.totalCents,
        tipCents: booked.tipCents,
        ticketStatusAfter: await ticketStatusAfter(db, ev.id, ticketRef),
        receipt: await loadReceipt(db, booked.id),
      })
    }
    if (key) {
      const booked = await findBookedPayment(db, ev.id, staff.staffId, key)
      if (booked) return await replay(booked)
    }

    // Fetch candidate items + their owning order
    const itemRows = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        unitPriceCents: orderItems.unitPriceCents,
        depositCents: orderItems.depositCents,
        quantity: orderItems.quantity,
        paymentStatus: orderItems.paymentStatus,
        productionStatus: orderItems.productionStatus,
        orderTableNo: orders.tableNo,
        orderEventId: orders.eventId,
        orderKind: orders.kind,
        isTrial: orders.isTrial,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(inArray(orderItems.id, input.orderItemIds))

    if (itemRows.length !== input.orderItemIds.length) {
      throw new AppError('NOT_FOUND', 404, 'One or more order items not found')
    }

    // Validate all belong to ticket
    let tableNo: number
    let walkOrderId: string | null = null
    if (parsed.kind === 'walkin') {
      walkOrderId = parsed.orderId!
      for (const r of itemRows) {
        if (r.orderId !== walkOrderId || r.orderKind !== 'walkin' || r.orderEventId !== ev.id) {
          throw new AppError('VALIDATION', 400, 'Item does not belong to this walk-in ticket')
        }
      }
      tableNo = itemRows[0]!.orderTableNo
    }
    else {
      tableNo = parsed.tableNo!
      for (const r of itemRows) {
        if (r.orderTableNo !== tableNo || r.orderKind === 'walkin' || r.orderEventId !== ev.id) {
          throw new AppError('VALIDATION', 400, 'Item does not belong to this table ticket')
        }
      }
    }

    // A payment is a test exactly when it settles rehearsal orders. Mixing
    // both would let "delete test data" remove real cash from the reports.
    const isTrial = itemRows[0]!.isTrial
    if (itemRows.some((r) => r.isTrial !== isTrial)) {
      throw new AppError('VALIDATION', 400, 'Please charge test and real orders separately')
    }

    const lines = buildSettleLines(itemRows, input.quantities)

    const totalCents = itemRows.reduce(
      (sum, r, i) => sum + (r.unitPriceCents + r.depositCents) * lines[i]!.payQuantity,
      0,
    )
    // A total of 0 € only happens when every chosen unit costs 0 € (e.g. a
    // 0-€ article): it closes those items without cash. Reports and the
    // cash drawer see nothing of it (see loadPaymentsByStaff).
    if (totalCents < 0) {
      throw new AppError('VALIDATION', 400, 'Payment total must not be negative')
    }
    if (totalCents === 0 && input.tipCents > 0) {
      throw new AppError('VALIDATION', 400, 'A settlement without cash cannot carry a tip')
    }

    const lockId = await acquirePaymentLock(db, {
      eventId: ev.id,
      tableNo,
      walkOrderId,
      staffId: staff.staffId,
    })

    let paymentId: string
    try {
      paymentId = await db.transaction(async (tx) => {
        // Re-check state inside the transaction: a concurrent payment or void
        // may have changed the items since the read above.
        const paidIds = await settleLines(tx, lines)
        const inserted = await tx
          .insert(payments)
          .values({ eventId: ev.id, staffId: staff.staffId, totalCents, tipCents: input.tipCents, isTrial, idempotencyKey: key })
          .returning({ id: payments.id })
        const pid = inserted[0]!.id
        await tx
          .insert(paymentItems)
          .values(paidIds.map((id) => ({ paymentId: pid, orderItemId: id })))
        await tx.insert(auditLog).values({
          action: 'payment',
          staffId: staff.staffId,
          targetKind: 'payment',
          targetId: pid,
          payload: {
            paymentId: pid,
            totalCents,
            tipCents: input.tipCents,
            ticketKey: input.ticketKey,
            orderItemIds: paidIds,
          },
        })
        return pid
      })
    }
    catch (err) {
      // A parallel retry with the same key booked first.
      if (key && isUniqueViolation(err)) {
        const booked = await findBookedPayment(db, ev.id, staff.staffId, key)
        if (booked) return await replay(booked)
      }
      throw err
    }
    finally {
      await releasePaymentLock(db, lockId)
    }

    // Someone was at the table: a call from it is answered.
    if (parsed.kind === 'table') await answerTableCalls(db, ev.id, tableNo, staff.staffId)
    const statusAfter = await ticketStatusAfter(db, ev.id, ticketRef)

    setResponseStatus(event, 201)
    log.info('payment.recorded', {
      requestId: event.context.requestId as string | undefined,
      userId: staff.staffId,
      route: 'POST /api/payments',
      paymentId,
      ticketKey: input.ticketKey,
      totalCents,
      tipCents: input.tipCents,
      ticketStatusAfter: statusAfter,
    })
    return PaymentResponseSchema.parse({
      paymentId,
      totalCents,
      tipCents: input.tipCents,
      ticketStatusAfter: statusAfter,
      receipt: await loadReceipt(db, paymentId),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
