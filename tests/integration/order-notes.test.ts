import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

describe('order notes — order → kitchen → cash', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('keeps the note through production and a partial payment split', async () => {
    const waiter = { staffId: seeded.staffId, role: 'waiter' as const }
    const fries = seeded.menuItemIds[0]!
    const order = await call<{ items: Array<{ orderItemId: string; note: string | null }> }>('../../server/api/orders/index.post', {
      method: 'POST',
      staff: waiter,
      body: {
        tableNo: 4,
        mode: 'staff_table',
        items: [{ menuItemId: fries, quantity: 3, note: 'ohne Salz' }, { menuItemId: fries, quantity: 1 }],
      },
    })
    expect(order.status).toBe(201)
    const salted = order.body.items.find((i) => i.note === 'ohne Salz')!

    const done = await call('../../server/api/production/items/[id].patch', {
      method: 'PATCH',
      staff: { staffId: seeded.staffId, role: 'kitchen' },
      params: { id: salted.orderItemId },
      body: { nextStatus: 'in_progress' },
    })
    expect(done.status).toBe(200)

    const paid = await call('../../server/api/payments/index.post', {
      method: 'POST',
      staff: waiter,
      body: { ticketKey: 't-4', orderItemIds: [salted.orderItemId], quantities: { [salted.orderItemId]: 2 } },
    })
    expect(paid.status).toBe(201)

    const rows = ctx.mem.public.many(
      `SELECT quantity, payment_status, note FROM order_items`,
    ) as Array<{ quantity: number; payment_status: string; note: string | null }>
    const key = (r: { payment_status: string; quantity: number; note: string | null }) => `${r.payment_status}${r.quantity}${r.note}`
    expect(rows.sort((a, b) => key(a).localeCompare(key(b)))).toEqual([
      { quantity: 2, payment_status: 'paid', note: 'ohne Salz' },
      { quantity: 1, payment_status: 'unpaid', note: null },
      { quantity: 1, payment_status: 'unpaid', note: 'ohne Salz' },
    ])
  })
})
