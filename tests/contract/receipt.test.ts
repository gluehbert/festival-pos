import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
interface Receipt {
  eventName: string
  tableNo: number | null
  lines: Array<{ nameDe: string; quantity: number; unitPriceCents: number; depositCents: number; note: string | null }>
  totalCents: number
  depositCents: number
  paidAt: string
  staffUsername: string
}

describe('receipt after cashing — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    // deposit and helper meals are off by default; these tests use them.
    ctx.mem.public.none('UPDATE events SET deposit_enabled = true, staff_meals_enabled = true')
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 200 WHERE id = '${seeded.menuItemIds[1]}'`)
  })

  it('returns the paid lines with event, table, total, time and cashier; a retry gets the same receipt', async () => {
    const waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' as const }
    const [fries, beer] = seeded.menuItemIds as [string, string]
    const order = await call<{ items: Array<{ orderItemId: string; menuItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST',
      staff: waiter,
      body: { tableNo: 5, mode: 'staff_table', items: [{ menuItemId: fries, quantity: 2, note: 'Mayo' }, { menuItemId: beer, quantity: 3 }] },
    })
    const beerLine = order.body.items.find((i) => i.menuItemId === beer)!.orderItemId
    const friesLine = order.body.items.find((i) => i.menuItemId === fries)!.orderItemId
    const body = { ticketKey: 't-5', orderItemIds: [friesLine, beerLine], quantities: { [beerLine]: 1 } }
    const paid = await call<{ totalCents: number; receipt: Receipt }>('../../server/api/payments/index.post', { method: 'POST', staff: waiter, key: 'pay-1', body })
    expect(paid.status).toBe(201)
    const r = paid.body.receipt
    expect(r).toMatchObject({ eventName: 'Demo', tableNo: 5, totalCents: 1300, depositCents: 200, staffUsername: 'anna' })
    expect(r.lines.map((l) => [l.nameDe, l.quantity, l.unitPriceCents, l.depositCents, l.note]).sort()).toEqual([
      ['Bier', 1, 400, 200, null],
      ['Pommes', 2, 350, 0, 'Mayo'],
    ])
    expect(Date.parse(r.paidAt)).not.toBeNaN()

    const replay = await call<{ receipt: Receipt }>('../../server/api/payments/index.post', { method: 'POST', staff: waiter, key: 'pay-1', body })
    expect(replay.status).toBe(200)
    expect(replay.body.receipt).toEqual(r)
  })

  it('a counter sale has no table on the receipt', async () => {
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const order = await call<{ orderId: string; items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: waiter, body: { tableNo: 0, mode: 'walkin', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] },
    })
    const paid = await call<{ receipt: Receipt }>('../../server/api/payments/index.post', {
      method: 'POST', staff: waiter, body: { ticketKey: `w-${order.body.orderId}`, orderItemIds: [order.body.items[0]!.orderItemId] },
    })
    expect(paid.body.receipt).toMatchObject({ tableNo: null, totalCents: 350 })
  })
})
