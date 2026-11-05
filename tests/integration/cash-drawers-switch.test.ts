import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
type Waiter = { staffId: string; role: 'waiter'; username: string }

async function order(waiter: Waiter, tableNo: number) {
  const res = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
    method: 'POST', staff: waiter, body: { tableNo, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[0], quantity: 1 }] },
  })
  return res.body.items.map((i) => i.orderItemId)
}
const pay = (waiter: Waiter, tableNo: number, orderItemIds: string[]) => call('../../server/api/payments/index.post', {
  method: 'POST', staff: waiter, body: { ticketKey: `t-${tableNo}`, orderItemIds },
})
const drawer = (waiter: Waiter) => call<{ session: unknown; required: boolean }>('../../server/api/cash/session.get', { staff: waiter })

describe('cash drawer per waiter as a feature switch', () => {
  let anna: Waiter
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    anna = { staffId: insertStaff('waiter', 'anna'), role: 'waiter', username: 'anna' }
  })

  it('off (the default): cashing needs no drawer', async () => {
    expect((await drawer(anna)).body.required).toBe(false)
    expect((await pay(anna, 3, await order(anna, 3))).status).toBe(201)
  })

  it('on: cashing waits for an open drawer, then books into it', async () => {
    ctx.mem.public.none(`UPDATE events SET cash_drawer_enabled = true`)
    expect((await drawer(anna)).body.required).toBe(true)
    const items = await order(anna, 4)
    const refused = await pay(anna, 4, items)
    expect(refused.status).toBe(409)
    expect(refused.error?.code).toBe('CASH_SESSION_REQUIRED')
    expect(ctx.mem.public.many(`SELECT id FROM payments`)).toEqual([])

    await call('../../server/api/cash/session.post', { method: 'POST', staff: anna, body: { openingCents: 5000 } })
    expect((await pay(anna, 4, items)).status).toBe(201)
    const now = await drawer(anna)
    expect(now.body.session).toMatchObject({ openingCents: 5000 })
    expect((now.body.session as { collectedCents: number }).collectedCents).toBeGreaterThan(0)
  })
})
