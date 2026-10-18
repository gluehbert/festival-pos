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

describe('Helferverpflegung — kitchen, reports, void', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    // deposit and helper meals are off by default; these tests use them.
    ctx.mem.public.none('UPDATE events SET deposit_enabled = true, staff_meals_enabled = true')
  })

  it('goes to the kitchen, stays out of tickets, revenue and cash, and shows up separately', async () => {
    const waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' as const }
    const fries = seeded.menuItemIds[0]!
    ctx.mem.public.none(`UPDATE menu_items SET stock = 10 WHERE id = '${fries}'`)
    await call('../../server/api/cash/session.post', { method: 'POST', staff: waiter, body: { openingCents: 0 } })
    await call('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 3, mode: 'staff_table', items: [{ menuItemId: fries, quantity: 1 }] },
    })
    const meal = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 0, mode: 'staff_meal', staffMealReason: 'Kapelle', items: [{ menuItemId: fries, quantity: 4 }] },
    })

    const queue = await call<{ items: Array<{ orderKind: string; quantity: number }> }>('../../server/api/production/queue.get', {
      staff: { staffId: insertStaff('kitchen'), role: 'kitchen' },
    })
    expect(queue.body.items.map((i) => [i.orderKind, i.quantity]).sort()).toEqual([['staff_meal', 4], ['staff_table', 1]])

    const tickets = await call<{ tickets: Array<{ ticketKey: string }> }>('../../server/api/tickets/index.get', { staff: waiter, url: '/x?status=all' })
    expect(tickets.body.tickets.map((t) => t.ticketKey)).toEqual(['t-3'])
    expect(ctx.mem.public.one(`SELECT stock FROM menu_items WHERE id = '${fries}'`)).toEqual({ stock: 5 })

    // Revenue counts paid items only: the open table order not yet, the
    // settled staff meal never.
    expect(await report('revenue_by_category')).toEqual([])
    expect(await report('top_items')).toEqual([])
    expect(await report<{ orderCount: number }>('orders_per_hour')).toEqual([expect.objectContaining({ orderCount: 1 })])
    expect(await report('staff_meals')).toEqual([{ menuItemId: fries, nameDe: 'Pommes', nameEn: 'Fries', quantity: 4, valueCents: 1400 }])
    const drawer = await call<{ session: { expectedCents: number } }>('../../server/api/cash/session.get', { staff: waiter })
    expect(drawer.body.session.expectedCents).toBe(0)

    // A staff meal can be voided although it is settled; the stock comes back.
    const voided = await call('../../server/api/order-items/[id]/void.post', {
      method: 'POST', staff: waiter, params: { id: meal.body.items[0]!.orderItemId }, body: { reason: 'doch nicht' },
    })
    expect(voided.status).toBe(200)
    expect(await report('staff_meals')).toEqual([])
    expect(ctx.mem.public.one(`SELECT stock FROM menu_items WHERE id = '${fries}'`)).toEqual({ stock: 9 })
  })

  it('a paid regular item still cannot be voided', async () => {
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const order = await call<{ orderId: string; items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 0, mode: 'walkin', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] },
    })
    const id = order.body.items[0]!.orderItemId
    await call('../../server/api/payments/index.post', { method: 'POST', staff: waiter, body: { ticketKey: `w-${order.body.orderId}`, orderItemIds: [id] } })
    const res = await call('../../server/api/order-items/[id]/void.post', { method: 'POST', staff: waiter, params: { id }, body: { reason: 'zu spät' } })
    expect(res.status).toBe(409)
  })
})
