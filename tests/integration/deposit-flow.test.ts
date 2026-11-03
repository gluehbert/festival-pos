import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const report = async <T>(type: string) => (await call<{ rows: T[] }>('../../server/api/admin/events/[id]/reports.get', {
  staff: { staffId: seeded.staffId, role: 'admin' },
  params: { id: seeded.eventId },
  url: `/x?type=${type}`,
})).body.rows

describe('deposit — order, cash, return, reports', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    // deposit and helper meals are off by default; these tests use them.
    ctx.mem.public.none('UPDATE events SET deposit_enabled = true, staff_meals_enabled = true')
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 200 WHERE id = '${seeded.menuItemIds[1]}'`) // Bier 4,00 + 2,00
  })

  it('collects deposit with the payment, keeps it out of revenue and lowers the Soll on return', async () => {
    const waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' as const }
    await call('../../server/api/cash/session.post', { method: 'POST', staff: waiter, body: { openingCents: 0 } })
    const order = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST',
      staff: waiter,
      body: { tableNo: 3, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 3 }] },
    })
    const ticket = await call<{ unpaidCents: number; items: Array<{ depositCents: number }> }>('../../server/api/tickets/[id].get', {
      staff: waiter,
      params: { id: 't-3' },
    })
    expect(ticket.body.unpaidCents).toBe(1800)
    const list = await call<{ tickets: Array<{ unpaidCents: number }> }>('../../server/api/tickets/index.get', { staff: waiter })
    expect(list.body.tickets[0]!.unpaidCents).toBe(1800)

    const id = order.body.items[0]!.orderItemId
    const paid = await call<{ totalCents: number }>('../../server/api/payments/index.post', {
      method: 'POST', staff: waiter, body: { ticketKey: 't-3', orderItemIds: [id], quantities: { [id]: 2 } },
    })
    expect(paid.body.totalCents).toBe(1200)
    // The split-off paid part keeps its deposit.
    const deposits = ctx.mem.public.many(`SELECT quantity, deposit_cents FROM order_items ORDER BY quantity`) as Array<{ deposit_cents: number }>
    expect(deposits.map((d) => d.deposit_cents)).toEqual([200, 200])

    await call('../../server/api/deposit-returns/index.post', { method: 'POST', staff: waiter, body: { unitCents: 200, quantity: 1 } })
    // Rehearsal bookings never count.
    ctx.mem.public.none(`INSERT INTO deposit_returns (event_id, staff_id, unit_cents, quantity, amount_cents, is_trial)
      VALUES ('${seeded.eventId}', '${waiter.staffId}', 200, 5, -1000, true)`)

    // Revenue: the 2 × 4.00 paid, without their 2 × 2.00 deposit (= 1200 cash − 400 deposit).
    expect(await report<{ totalCents: number }>('revenue_by_category')).toContainEqual(expect.objectContaining({ category: 'drink', totalCents: 800 }))
    expect(await report('deposits')).toEqual([
      { unitCents: 200, issuedQuantity: 2, issuedCents: 400, returnedQuantity: 1, returnedCents: -200, balanceCents: 200 },
    ])

    const drawer = await call<{ session: { collectedCents: number; depositReturnedCents: number; expectedCents: number } }>(
      '../../server/api/cash/session.get',
      { staff: waiter },
    )
    expect(drawer.body.session).toMatchObject({ collectedCents: 1200, depositReturnedCents: -200, expectedCents: 1000 })

    const { deleteTrialData } = await import('../../server/lib/events')
    await deleteTrialData(ctx.db as never, seeded.eventId, seeded.staffId)
    expect(ctx.mem.public.many(`SELECT is_trial FROM deposit_returns`)).toEqual([{ is_trial: false }])
  })

  it('refunds the deposit together with the item', async () => {
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const order = await call<{ orderId: string; items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 0, mode: 'walkin', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 1 }] },
    })
    const itemId = order.body.items[0]!.orderItemId
    await call('../../server/api/payments/index.post', { method: 'POST', staff: waiter, body: { ticketKey: `w-${order.body.orderId}`, orderItemIds: [itemId] } })
    const admin = { staffId: seeded.staffId, role: 'admin' as const }
    await call('../../server/api/cash/session.post', { method: 'POST', staff: admin, body: { openingCents: 1000 } })
    const refund = await call<{ amountCents: number }>('../../server/api/admin/order-items/[id]/refund.post', {
      method: 'POST', staff: admin, params: { id: itemId }, body: { reason: 'verschüttet' },
    })
    expect(refund.body.amountCents).toBe(600)
  })
})
