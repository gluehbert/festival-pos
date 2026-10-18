import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const admin = () => ({ staffId: seeded.staffId, role: 'admin' as const })
const report = async <T>(type: string, format = 'json') => (await call<{ rows: T[] } & string>('../../server/api/admin/events/[id]/reports.get', {
  staff: admin(), params: { id: seeded.eventId }, url: `/x?type=${type}&format=${format}`,
})).body

type Waiter = { staffId: string; role: 'waiter' }

async function pay(waiter: Waiter, menuItemId: string, tableNo: number, tipCents: number) {
  const order = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
    method: 'POST', staff: waiter, body: { tableNo, mode: 'staff_table', items: [{ menuItemId, quantity: 1 }] },
  })
  const res = await call<{ paymentId: string }>('../../server/api/payments/index.post', {
    method: 'POST', staff: waiter,
    body: { ticketKey: `t-${tableNo}`, orderItemIds: order.body.items.map((i) => i.orderItemId), tipCents },
  })
  expect(res.status).toBe(201)
  return { paymentId: res.body.paymentId, orderItemId: order.body.items[0]!.orderItemId }
}

describe('Tips: drawer, revenue, reports', () => {
  let anna: Waiter
  let ben: Waiter
  let fries: string
  let beer: string

  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    ;[fries, beer] = seeded.menuItemIds as [string, string]
    anna = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' }
    ben = { staffId: insertStaff('waiter', 'ben'), role: 'waiter' }
  })

  it('the expected amount includes the tip; revenue stays without it; refunds leave the tip alone', async () => {
    await call('../../server/api/cash/session.post', { method: 'POST', staff: anna, body: { openingCents: 5000 } })
    await pay(anna, fries, 1, 150) // 350 + 150
    const second = await pay(anna, beer, 2, 0) // 400
    await call('../../server/api/admin/order-items/[id]/refund.post', {
      method: 'POST', staff: admin(), params: { id: second.orderItemId }, body: { reason: 'too warm' },
    })

    const live = await call<{ session: { collectedCents: number; tipCents: number; refundedCents: number; expectedCents: number } }>(
      '../../server/api/cash/session.get', { staff: anna },
    )
    // 5000 + 750 + 150 − 400
    expect(live.body.session).toMatchObject({ collectedCents: 750, tipCents: 150, refundedCents: 400, expectedCents: 5500 })

    const closed = await call<{ expectedCents: number; tipCents: number }>('../../server/api/cash/session/close.post', {
      method: 'POST', staff: anna, body: { countedCents: 5500 },
    })
    expect(closed.body).toMatchObject({ expectedCents: 5500, tipCents: 150 })

    const revenue = await report<{ category: string; totalCents: number }>('revenue_by_category')
    expect(revenue.rows.reduce((s, r) => s + r.totalCents, 0)).toBe(350)
    const sum = ctx.mem.public.one(`SELECT SUM(total_cents) AS s, SUM(tip_cents) AS t FROM payments`) as { s: number; t: number }
    expect(Number(sum.s)).toBe(750)
    expect(Number(sum.t)).toBe(150)
  })

  it('report "tips" sums per waiter plus a total row; payments_by_staff gets a tip column', async () => {
    await pay(anna, fries, 1, 150)
    await pay(anna, beer, 2, 50)
    await pay(anna, fries, 3, 0)
    await pay(ben, beer, 4, 300)

    const tips = (await report<Record<string, unknown>>('tips')).rows
    expect(tips).toEqual([
      expect.objectContaining({ username: 'ben', paymentCount: 1, tipCents: 300 }),
      expect.objectContaining({ username: 'anna', paymentCount: 2, tipCents: 200 }),
      expect.objectContaining({ staffId: null, username: null, paymentCount: 3, tipCents: 500 }),
    ])

    const perStaff = (await report<{ username: string; tipCents: number }>('payments_by_staff')).rows
    expect(perStaff.find((r) => r.username === 'anna')?.tipCents).toBe(200)
    expect(perStaff.find((r) => r.username === 'ben')?.tipCents).toBe(300)

    const csv = await report('tips', 'csv') as unknown as string
    expect(csv.slice(1).split('\r\n')[0]).toBe('staffId;username;paymentCount;tipCents')
  })

  it('a rehearsal payment with a tip appears nowhere', async () => {
    await call('../../server/api/cash/session.post', { method: 'POST', staff: anna, body: { openingCents: 1000 } })
    ctx.mem.public.none(`UPDATE events SET trial_mode = true WHERE id = '${seeded.eventId}'`)
    await pay(anna, fries, 1, 500)
    const trial = ctx.mem.public.one(`SELECT is_trial, tip_cents FROM payments`) as { is_trial: boolean; tip_cents: number }
    expect(trial).toEqual({ is_trial: true, tip_cents: 500 })

    expect((await report('tips')).rows).toEqual([])
    const live = await call<{ session: { tipCents: number; expectedCents: number } }>('../../server/api/cash/session.get', { staff: anna })
    expect(live.body.session).toMatchObject({ tipCents: 0, expectedCents: 1000 })
  })
})
