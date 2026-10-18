import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const admin = () => ({ staffId: seeded.staffId, role: 'admin' as const })
const report = async <T>(type: string) => (await call<{ rows: T[] }>('../../server/api/admin/events/[id]/reports.get', {
  staff: admin(), params: { id: seeded.eventId }, url: `/x?type=${type}`,
})).body.rows

describe('0-€ tickets can be closed', () => {
  let water: string
  let fries: string

  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    fries = seeded.menuItemIds[0]!
    water = seeded.menuItemIds[2]!
    // Leitungswasser: free article.
    ctx.mem.public.none(`UPDATE menu_items SET price_cents = 0, is_available = true WHERE id = '${water}'`)
  })

  it('settles a ticket with only 0-€ items; cash drawer and reports stay as they were', async () => {
    const waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' as const }
    await call('../../server/api/cash/session.post', { method: 'POST', staff: waiter, body: { openingCents: 500 } })
    const order = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 7, mode: 'staff_table', items: [{ menuItemId: water, quantity: 2 }] },
    })
    const ids = order.body.items.map((i) => i.orderItemId)

    const paid = await call<{ totalCents: number; ticketStatusAfter: string }>('../../server/api/payments/index.post', {
      method: 'POST', staff: waiter, body: { ticketKey: 't-7', orderItemIds: ids },
    })
    expect(paid.status).toBe(201)
    expect(paid.body).toMatchObject({ totalCents: 0, ticketStatusAfter: 'paid' })
    expect(ctx.mem.public.one(`SELECT payment_status FROM order_items WHERE id = '${ids[0]}'`)).toEqual({ payment_status: 'paid' })

    const tickets = await call<{ tickets: unknown[] }>('../../server/api/tickets/index.get', { staff: waiter })
    expect(tickets.body.tickets).toEqual([])

    const drawer = await call<{ session: { collectedCents: number; expectedCents: number } }>('../../server/api/cash/session.get', { staff: waiter })
    expect(drawer.body.session).toMatchObject({ collectedCents: 0, expectedCents: 500 })
    expect(await report('payments_by_staff')).toEqual([])
    expect(await report('revenue_by_category')).toEqual([{ category: 'drink', totalCents: 0, itemCount: 2 }])
  })

  it('a priced item in the selection still needs real money; the DB never takes negative totals', async () => {
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const order = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 8, mode: 'staff_table', items: [{ menuItemId: water, quantity: 1 }, { menuItemId: fries, quantity: 1 }] },
    })
    const paid = await call<{ totalCents: number }>('../../server/api/payments/index.post', {
      method: 'POST', staff: waiter, body: { ticketKey: 't-8', orderItemIds: order.body.items.map((i) => i.orderItemId) },
    })
    expect(paid.body.totalCents).toBe(350)
    expect(await report<{ paymentCount: number; totalCents: number }>('payments_by_staff')).toEqual([
      expect.objectContaining({ paymentCount: 1, totalCents: 350 }),
    ])
    expect(() => ctx.mem.public.none(
      `INSERT INTO payments (event_id, staff_id, total_cents) VALUES ('${seeded.eventId}', '${waiter.staffId}', -1)`,
    )).toThrow()
  })
})
