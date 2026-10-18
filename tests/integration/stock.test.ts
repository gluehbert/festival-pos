import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let fries: string
const waiter = () => ({ staffId: seeded.staffId, role: 'waiter' as const })
const row = () => ctx.mem.public.one(`SELECT stock, is_available FROM menu_items WHERE id = '${fries}'`) as { stock: number | null; is_available: boolean }
const order = (items: Array<{ quantity: number; note?: string }>, key?: string) =>
  call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
    method: 'POST',
    staff: waiter(),
    key,
    body: { tableNo: 1, mode: 'staff_table', items: items.map((i) => ({ menuItemId: fries, ...i })) },
  })

describe('Stock — order, sold out, void', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    fries = seeded.menuItemIds[0]!
    ctx.mem.public.none(`UPDATE menu_items SET stock = 3 WHERE id = '${fries}'`)
  })

  it('counts down, refuses more than is left without booking anything, and sells out at 0', async () => {
    expect((await order([{ quantity: 2 }])).status).toBe(201)
    expect(row()).toEqual({ stock: 1, is_available: true })

    // Two lines of the same article (different notes) count together.
    const tooMany = await order([{ quantity: 1 }, { quantity: 1, note: 'ohne Salz' }])
    expect(tooMany.status).toBe(409)
    expect(tooMany.error?.code).toBe('SOLD_OUT')
    expect(tooMany.error?.message).toMatch(/not available/)
    expect(ctx.mem.public.many(`SELECT id FROM orders`)).toHaveLength(1)
    expect(row().stock).toBe(1)

    const last = await order([{ quantity: 1 }])
    expect(last.status).toBe(201)
    expect(row()).toEqual({ stock: 0, is_available: false })
    expect((await order([{ quantity: 1 }])).status).toBe(409)

    // Storno gives the unit back and the article is available again.
    const voided = await call('../../server/api/order-items/[id]/void.post', {
      method: 'POST',
      staff: waiter(),
      params: { id: last.body.items[0]!.orderItemId },
      body: { reason: 'falsch bestellt' },
    })
    expect(voided.status).toBe(200)
    expect(row()).toEqual({ stock: 1, is_available: true })
  })

  it('never oversells with parallel orders', async () => {
    ctx.mem.public.none(`UPDATE menu_items SET stock = 5 WHERE id = '${fries}'`)
    const results = await Promise.all([1, 2, 3, 4].map((n) => order([{ quantity: 2 }], `k-${n}`)))
    expect(results.filter((r) => r.status === 201)).toHaveLength(2)
    expect(results.filter((r) => r.status === 409)).toHaveLength(2)
    expect(row()).toEqual({ stock: 1, is_available: true })
    const sold = ctx.mem.public.one(`SELECT SUM(quantity) AS n FROM order_items`) as { n: number }
    expect(Number(sold.n)).toBe(4)
  })

  it('refuses an article switched to sold out by the bar and names it', async () => {
    const schorle = seeded.menuItemIds[1]!
    const bar = insertStaff('admin')
    const off = await call('../../server/api/menu/[id]/availability.patch', {
      method: 'PATCH', staff: { staffId: bar, role: 'admin' }, params: { id: schorle }, body: { isAvailable: false },
    })
    expect(off.status).toBe(200)
    const res = await call('../../server/api/orders/index.post', {
      method: 'POST',
      staff: waiter(),
      body: { tableNo: 1, mode: 'staff_table', items: [{ menuItemId: fries, quantity: 1 }, { menuItemId: schorle, quantity: 1 }] },
    })
    expect(res.status).toBe(409)
    expect(res.error?.code).toBe('SOLD_OUT')
    expect(res.error?.details).toEqual({ menuItemIds: [schorle] })
    expect(ctx.mem.public.many(`SELECT id FROM orders`)).toHaveLength(0)
    expect(row().stock).toBe(3)
  })

  it('refuses a sold-out article inside the order transaction too', async () => {
    // Switched off after the order's pre-check read the menu.
    ctx.mem.public.none(`UPDATE menu_items SET is_available = false WHERE id = '${fries}'`)
    const { takeStock } = await import('../../server/lib/stock')
    await expect(ctx.db.transaction((tx) => takeStock(tx as never, [{ menuItemId: fries, quantity: 1 }], () => 'Pommes')))
      .rejects.toMatchObject({ code: 'SOLD_OUT' })
    expect(row()).toEqual({ stock: 3, is_available: false })
  })

  it('leaves articles without stock untouched', async () => {
    const beer = seeded.menuItemIds[1]!
    const res = await call('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter(), body: { tableNo: 1, mode: 'staff_table', items: [{ menuItemId: beer, quantity: 40 }] },
    })
    expect(res.status).toBe(201)
    expect(ctx.mem.public.one(`SELECT stock, is_available FROM menu_items WHERE id = '${beer}'`)).toEqual({ stock: null, is_available: true })
  })
})
