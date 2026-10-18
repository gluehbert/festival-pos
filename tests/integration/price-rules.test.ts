import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest, insertStaff } from '../setup/call'
import type { Menu, Order } from '../../server/lib/contracts/guest'
import type { PriceRuleDto, PriceRuleReportRow } from '../../server/lib/contracts/pricing'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const admin = () => ({ staffId: seeded.staffId, role: 'admin' as const })
const ORDERS = '../../server/api/orders/index.post'
const PAY = '../../server/api/payments/index.post'
const fries = () => seeded.menuItemIds[0]!
const beer = () => seeded.menuItemIds[1]!

async function createRule(body: Record<string, unknown>): Promise<PriceRuleDto> {
  const res = await call<PriceRuleDto>('../../server/api/admin/events/[id]/price-rules/index.post', {
    method: 'POST', staff: admin(), params: { id: seeded.eventId },
    body: { name: 'Happy Hour', startTime: '17:00', endTime: '18:00', menuItemIds: [beer()], kind: 'fixed', value: 300, ...body },
  })
  expect(res.status).toBe(201)
  return res.body
}

const report = async () => (await call<{ rows: PriceRuleReportRow[] }>('../../server/api/admin/events/[id]/reports.get', {
  staff: admin(), params: { id: seeded.eventId }, url: '/x?type=price_rules',
})).body.rows

const guestOrder = async (items: Array<{ menuItemId: string; quantity: number }>, key?: string) =>
  call<Order>(ORDERS, { method: 'POST', guest: insertGuest(seeded.eventId, 4), body: { tableNo: 4, items }, key })

describe('Time-based prices — menu, orders, reports', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    // deposit and helper meals are off by default; these tests use them.
    ctx.mem.public.none('UPDATE events SET deposit_enabled = true, staff_meals_enabled = true')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-10T15:30:00Z')) // Fr 17:30 Berlin
  })
  afterEach(() => vi.useRealTimers())

  it('shows the promotion price, the regular price and its end in the menu', async () => {
    await createRule({})
    const menu = await call<Menu>('../../server/api/menu/index.get')
    const b = menu.body.items.find((i) => i.id === beer())!
    expect(b).toMatchObject({ priceCents: 300, regularPriceCents: 400, promo: { name: 'Happy Hour', endsAt: '2026-07-10T16:00:00.000Z' } })
    expect(menu.body.items.find((i) => i.id === fries())).toMatchObject({ priceCents: 350, regularPriceCents: 350, promo: null })

    vi.setSystemTime(new Date('2026-07-10T16:00:00Z')) // 18:00: over
    const later = await call<Menu>('../../server/api/menu/index.get')
    expect(later.body.items.find((i) => i.id === beer())).toMatchObject({ priceCents: 400, promo: null })
  })

  it('books the price at order time, keeps deposit, and leaves earlier orders alone', async () => {
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 200 WHERE id = '${beer()}'`)
    vi.setSystemTime(new Date('2026-07-10T14:59:00Z')) // 16:59: before
    const before = await guestOrder([{ menuItemId: beer(), quantity: 1 }])
    expect(before.body.items[0]).toMatchObject({ unitPriceCents: 400, depositCents: 200, regularPriceCents: null, priceRuleName: null })

    await createRule({})
    vi.setSystemTime(new Date('2026-07-10T15:30:00Z'))
    const during = await guestOrder([{ menuItemId: beer(), quantity: 2 }, { menuItemId: fries(), quantity: 1 }])
    const line = during.body.items.find((i) => i.menuItemId === beer())!
    expect(line).toMatchObject({ unitPriceCents: 300, depositCents: 200, regularPriceCents: 400, priceRuleName: 'Happy Hour' })
    expect(during.body.items.find((i) => i.menuItemId === fries())).toMatchObject({ unitPriceCents: 350, priceRuleName: null })
    // Earlier 400 + 200, now 2 × (300 + 200) + 350.
    expect(during.body.tableBalanceCents).toBe(600 + 1000 + 350)

    const prices = ctx.mem.public.many(`SELECT unit_price_cents AS p FROM order_items WHERE menu_item_id = '${beer()}' ORDER BY unit_price_cents`) as Array<{ p: number }>
    expect(prices.map((r) => r.p)).toEqual([300, 400])
  })

  it('ignores any price sent by the client', async () => {
    const res = await call<Order>(ORDERS, {
      method: 'POST', guest: insertGuest(seeded.eventId, 4),
      body: { tableNo: 4, items: [{ menuItemId: beer(), quantity: 1, unitPriceCents: 1, priceCents: 1 }] },
    })
    expect(res.status).toBe(201)
    expect(res.body.items[0]!.unitPriceCents).toBe(400)
  })

  it('applies over midnight, to categories, and the switched-off rule never', async () => {
    await createRule({ name: 'Restposten', startTime: '22:00', endTime: '02:00', menuItemIds: [], categories: ['food'], kind: 'fixed', value: 200 })
    const off = await createRule({ name: 'Aus', menuItemIds: [fries()], kind: 'fixed', value: 100, isActive: false })
    expect(off.isActive).toBe(false)
    vi.setSystemTime(new Date('2026-07-10T23:15:00Z')) // Sa 01:15 Berlin
    const res = await guestOrder([{ menuItemId: fries(), quantity: 1 }])
    expect(res.body.items[0]).toMatchObject({ unitPriceCents: 200, priceRuleName: 'Restposten' })
  })

  it('reports units, revenue and discount per rule, also after the rule is deleted', async () => {
    const rule = await createRule({})
    const order = await guestOrder([{ menuItemId: beer(), quantity: 3 }, { menuItemId: fries(), quantity: 1 }])
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    // Open items are not sold yet.
    expect(await report()).toEqual([])
    await call(PAY, { method: 'POST', staff: waiter, body: { ticketKey: 't-4', orderItemIds: order.body.items.map((i) => i.orderItemId) } })
    // Staff meals stay at 0 € and never count as sold under a rule.
    await call(ORDERS, { method: 'POST', staff: waiter, body: { tableNo: 0, mode: 'staff_meal', staffMealReason: 'Kapelle', items: [{ menuItemId: beer(), quantity: 1 }] } })
    const row = { ruleId: rule.id, ruleName: 'Happy Hour', menuItemId: beer(), nameDe: 'Bier', nameEn: 'Beer', quantity: 3, totalCents: 900, discountCents: 300 }
    expect(await report()).toEqual([row])

    await call('../../server/api/admin/price-rules/[id].delete', { method: 'DELETE', staff: admin(), params: { id: rule.id } })
    expect(await report()).toEqual([row])

    const csv = await call<string>('../../server/api/admin/events/[id]/reports.get', {
      staff: admin(), params: { id: seeded.eventId }, url: '/x?type=price_rules&format=csv',
    })
    expect(csv.body).toContain('ruleId;ruleName;menuItemId;nameDe;nameEn;quantity;totalCents;discountCents')
    expect(csv.body).toContain(`${rule.id};Happy Hour;${beer()};Bier;Beer;3;900;300`)
  })

  it('keeps the rule on the paid part of a split line; only that part counts', async () => {
    const rule = await createRule({})
    const order = await guestOrder([{ menuItemId: beer(), quantity: 3 }])
    const id = order.body.items[0]!.orderItemId
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const paid = await call<{ totalCents: number }>(PAY, { method: 'POST', staff: waiter, body: { ticketKey: 't-4', orderItemIds: [id], quantities: { [id]: 1 } } })
    expect(paid.body.totalCents).toBe(300)
    const lines = ctx.mem.public.many(
      `SELECT quantity, payment_status, price_rule_id, price_rule_name, regular_price_cents FROM order_items ORDER BY quantity`,
    )
    expect(lines).toEqual([
      { quantity: 1, payment_status: 'paid', price_rule_id: rule.id, price_rule_name: 'Happy Hour', regular_price_cents: 400 },
      { quantity: 2, payment_status: 'unpaid', price_rule_id: rule.id, price_rule_name: 'Happy Hour', regular_price_cents: 400 },
    ])
    expect(await report()).toEqual([
      { ruleId: rule.id, ruleName: 'Happy Hour', menuItemId: beer(), nameDe: 'Bier', nameEn: 'Beer', quantity: 1, totalCents: 300, discountCents: 100 },
    ])
  })
})
