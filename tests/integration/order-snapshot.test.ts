import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

describe('order items keep name and category as ordered', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('stores them on order and copies them when a partial payment splits the line', async () => {
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const beer = seeded.menuItemIds[1]!
    const order = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 4, mode: 'staff_table', items: [{ menuItemId: beer, quantity: 3 }] },
    })
    expect(order.status).toBe(201)
    const id = order.body.items[0]!.orderItemId
    ctx.mem.public.none(`UPDATE menu_items SET name_de = 'Helles', category = 'bier' WHERE id = '${beer}'`)

    const paid = await call('../../server/api/payments/index.post', {
      method: 'POST', staff: waiter, body: { ticketKey: 't-4', orderItemIds: [id], quantities: { [id]: 1 } },
    })
    expect(paid.status).toBe(201)
    const rows = ctx.mem.public.many(
      `SELECT quantity, payment_status, name_de, name_en, category FROM order_items ORDER BY quantity`,
    )
    expect(rows).toEqual([
      { quantity: 1, payment_status: 'paid', name_de: 'Bier', name_en: 'Beer', category: 'drink' },
      { quantity: 2, payment_status: 'unpaid', name_de: 'Bier', name_en: 'Beer', category: 'drink' },
    ])
  })
})
