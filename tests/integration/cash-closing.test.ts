import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

async function walkinPaid(waiter: { staffId: string; role: 'waiter' }, menuItemId: string, quantity: number) {
  const order = await call<{ orderId: string; items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
    method: 'POST',
    staff: waiter,
    body: { tableNo: 0, mode: 'walkin', items: [{ menuItemId, quantity }] },
  })
  const pay = await call<{ paymentId: string; totalCents: number }>('../../server/api/payments/index.post', {
    method: 'POST',
    staff: waiter,
    body: { ticketKey: `w-${order.body.orderId}`, orderItemIds: order.body.items.map((i) => i.orderItemId) },
  })
  expect(pay.status).toBe(201)
  return { ...pay.body, orderItemId: order.body.items[0]!.orderItemId }
}

describe('Kassenabschluss — open, cash, refund, close', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('Soll = float + own payments in the window − refunds; test payments and other waiters do not count', async () => {
    const anna = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' as const }
    const ben = { staffId: insertStaff('waiter', 'ben'), role: 'waiter' as const }
    const [fries, beer] = seeded.menuItemIds as [string, string]

    // Cash taken before the drawer was opened is not part of it.
    ctx.mem.public.none(`INSERT INTO payments (event_id, staff_id, total_cents, created_at)
      VALUES ('${seeded.eventId}', '${anna.staffId}', 999, now() - interval '1 hour')`)
    await call('../../server/api/cash/session.post', { method: 'POST', staff: anna, body: { openingCents: 5000 } })

    await walkinPaid(anna, fries, 2) // 700
    const second = await walkinPaid(anna, beer, 1) // 400
    await walkinPaid(ben, beer, 3) // other waiter
    ctx.mem.public.none(`INSERT INTO payments (event_id, staff_id, total_cents, is_trial)
      VALUES ('${seeded.eventId}', '${anna.staffId}', 777, true)`)

    // The refund is paid out of the refunding admin's drawer, not Anna's.
    const admin = { staffId: seeded.staffId, role: 'admin' as const }
    await call('../../server/api/cash/session.post', { method: 'POST', staff: admin, body: { openingCents: 1000 } })
    const refund = await call('../../server/api/admin/order-items/[id]/refund.post', {
      method: 'POST',
      staff: admin,
      params: { id: second.orderItemId },
      body: { reason: 'zu warm' },
    })
    expect(refund.status).toBe(201)

    const live = await call<{ session: { collectedCents: number; refundedCents: number; expectedCents: number } }>(
      '../../server/api/cash/session.get',
      { staff: anna },
    )
    expect(live.body.session).toMatchObject({ collectedCents: 1100, refundedCents: 0, expectedCents: 6100 })
    const adminLive = await call<{ session: { collectedCents: number; refundedCents: number; expectedCents: number } }>(
      '../../server/api/cash/session.get',
      { staff: admin },
    )
    expect(adminLive.body.session).toMatchObject({ collectedCents: 0, refundedCents: 400, expectedCents: 600 })

    const closed = await call<{ expectedCents: number; countedCents: number; differenceCents: number; closedAt: string }>(
      '../../server/api/cash/session/close.post',
      { method: 'POST', staff: anna, body: { countedCents: 6050, note: 'Münze verloren' } },
    )
    expect(closed.status).toBe(200)
    expect(closed.body).toMatchObject({ expectedCents: 6100, countedCents: 6050, differenceCents: -50 })
    expect(closed.body.closedAt).toBeTruthy()

    // Later payments do not change a closed drawer; a new one can be opened.
    await walkinPaid(anna, fries, 1)
    const report = await call<{ rows: Array<{ username: string; expectedCents: number; differenceCents: number | null; note: string | null }> }>(
      '../../server/api/admin/events/[id]/reports.get',
      { staff: { staffId: seeded.staffId, role: 'admin' }, params: { id: seeded.eventId }, url: '/x?type=cash_sessions' },
    )
    expect(report.body.rows.filter((r) => r.username === 'anna')).toMatchObject([{ username: 'anna', expectedCents: 6100, differenceCents: -50, note: 'Münze verloren' }])
    // The per-staff report shows the refund at the refunding admin, not at Anna.
    const perStaff = await call<{ rows: Array<{ username: string; refundedCents: number; totalCents: number }> }>(
      '../../server/api/admin/events/[id]/reports.get',
      { staff: admin, params: { id: seeded.eventId }, url: '/x?type=payments_by_staff' },
    )
    expect(perStaff.body.rows.find((r) => r.username === 'anna')).toMatchObject({ refundedCents: 0 })
    expect(perStaff.body.rows.find((r) => r.username !== 'anna' && r.refundedCents > 0)).toMatchObject({ refundedCents: 400, totalCents: -400 })
    expect((await call('../../server/api/cash/session.post', { method: 'POST', staff: anna, body: { openingCents: 0 } })).status).toBe(201)

    const audit = ctx.mem.public.many(`SELECT action, payload FROM audit_log WHERE action = 'cash_close'`) as Array<{ payload: Record<string, number> }>
    expect(audit).toHaveLength(1)
    expect(audit[0]!.payload).toMatchObject({ expectedCents: 6100, countedCents: 6050, differenceCents: -50 })
  })
})
