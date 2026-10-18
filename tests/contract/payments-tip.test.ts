import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let waiter: { staffId: string; role: 'waiter' }

const PAY = '../../server/api/payments/index.post'

async function order(tableNo: number, menuItemId: string): Promise<string[]> {
  const res = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
    method: 'POST', staff: waiter, body: { tableNo, mode: 'staff_table', items: [{ menuItemId, quantity: 1 }] },
  })
  return res.body.items.map((i) => i.orderItemId)
}

describe('POST /api/payments — tip', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' }
  })

  it('stores the tip on the payment, keeps total_cents as the bill and returns it on the receipt', async () => {
    const ids = await order(3, seeded.menuItemIds[0]!) // 350
    const r = await call<{ paymentId: string; totalCents: number; tipCents: number; receipt: { tipCents: number; totalCents: number } }>(PAY, {
      method: 'POST', staff: waiter, body: { ticketKey: 't-3', orderItemIds: ids, tipCents: 150 },
    })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ totalCents: 350, tipCents: 150, receipt: { totalCents: 350, tipCents: 150 } })
    expect(ctx.mem.public.one(`SELECT total_cents, tip_cents FROM payments WHERE id = '${r.body.paymentId}'`))
      .toEqual({ total_cents: 350, tip_cents: 150 })
    const audit = ctx.mem.public.one(`SELECT payload FROM audit_log WHERE action = 'payment'`) as { payload: { tipCents: number } }
    expect(audit.payload.tipCents).toBe(150)
  })

  it('defaults to no tip', async () => {
    const ids = await order(4, seeded.menuItemIds[0]!)
    const r = await call<{ tipCents: number }>(PAY, { method: 'POST', staff: waiter, body: { ticketKey: 't-4', orderItemIds: ids } })
    expect(r.body.tipCents).toBe(0)
  })

  it('a replay with the same Idempotency-Key returns the stored tip', async () => {
    const ids = await order(5, seeded.menuItemIds[0]!)
    const first = await call<{ paymentId: string }>(PAY, {
      method: 'POST', staff: waiter, key: 'tip-key-1', body: { ticketKey: 't-5', orderItemIds: ids, tipCents: 200 },
    })
    const again = await call<{ paymentId: string; tipCents: number; receipt: { tipCents: number } }>(PAY, {
      method: 'POST', staff: waiter, key: 'tip-key-1', body: { ticketKey: 't-5', orderItemIds: ids, tipCents: 200 },
    })
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ paymentId: first.body.paymentId, tipCents: 200, receipt: { tipCents: 200 } })
    expect(ctx.mem.public.many(`SELECT id FROM payments`)).toHaveLength(1)
  })

  it('rejects a negative tip and one above 1000 €', async () => {
    const ids = await order(6, seeded.menuItemIds[0]!)
    for (const tipCents of [-1, 100_001, 1.5]) {
      const r = await call(PAY, { method: 'POST', staff: waiter, body: { ticketKey: 't-6', orderItemIds: ids, tipCents } })
      expect(r.status).toBe(400)
    }
    expect(ctx.mem.public.many(`SELECT id FROM payments`)).toHaveLength(0)
  })

  it('rejects a tip on a 0-€ settlement', async () => {
    const free = seeded.menuItemIds[2]!
    ctx.mem.public.none(`UPDATE menu_items SET price_cents = 0, is_available = true WHERE id = '${free}'`)
    const ids = await order(7, free)
    const r = await call(PAY, { method: 'POST', staff: waiter, body: { ticketKey: 't-7', orderItemIds: ids, tipCents: 100 } })
    expect(r.status).toBe(400)
    const ok = await call(PAY, { method: 'POST', staff: waiter, body: { ticketKey: 't-7', orderItemIds: ids } })
    expect(ok.status).toBe(201)
  })
})
