import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const stock = () =>
  (ctx.mem.public.one(`SELECT stock FROM menu_items WHERE id = '${seeded.menuItemIds[0]}'`) as { stock: number }).stock

async function order(quantity: number) {
  const guest = insertGuest(seeded.eventId, 3)
  return call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
    method: 'POST',
    guest,
    body: { tableNo: 3, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity }] },
  })
}

describe('stock in rehearsal mode', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    ctx.mem.public.none(`UPDATE menu_items SET stock = 10 WHERE id = '${seeded.menuItemIds[0]}'`)
  })

  it('a real order takes stock (control)', async () => {
    expect((await order(2)).status).toBe(201)
    expect(stock()).toBe(8)
  })

  it('an order in rehearsal leaves the stock unchanged', async () => {
    ctx.mem.public.none(`UPDATE events SET trial_mode = true WHERE id = '${seeded.eventId}'`)
    expect((await order(2)).status).toBe(201)
    expect(stock()).toBe(10)
  })

  it('a rehearsal order still cannot be placed for a sold-out article', async () => {
    ctx.mem.public.none(`UPDATE events SET trial_mode = true WHERE id = '${seeded.eventId}'`)
    ctx.mem.public.none(`UPDATE menu_items SET stock = 0, is_available = false WHERE id = '${seeded.menuItemIds[0]}'`)
    expect((await order(1)).status).toBeGreaterThanOrEqual(400)
  })

  it('voiding a rehearsal item leaves the stock unchanged', async () => {
    ctx.mem.public.none(`UPDATE events SET trial_mode = true WHERE id = '${seeded.eventId}'`)
    const placed = await order(2)
    const r = await call('../../server/api/order-items/[id]/void.post', {
      method: 'POST',
      staff: { staffId: seeded.staffId, role: 'waiter' },
      params: { id: placed.body.items[0]!.orderItemId },
      body: { reason: 'spilled drink' },
    })
    expect(r.status).toBe(200)
    expect(stock()).toBe(10)
  })

  it('voiding a real item still returns the stock (control)', async () => {
    const placed = await order(2)
    await call('../../server/api/order-items/[id]/void.post', {
      method: 'POST',
      staff: { staffId: seeded.staffId, role: 'waiter' },
      params: { id: placed.body.items[0]!.orderItemId },
      body: { reason: 'spilled drink' },
    })
    expect(stock()).toBe(10)
  })
})
