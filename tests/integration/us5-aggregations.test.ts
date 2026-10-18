import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import type {
  OrdersPerHourRow,
  PaymentsByStaffRow,
  RevenueByCategoryRow,
  TopItemRow,
  VoidRow,
} from '../../server/lib/contracts/reports'

beforeAll(async () => {
  await installCommonMocks()
})

interface Seeded {
  eventId: string
  adminId: string
  waiterId: string
  items: { friesId: string; burgerId: string; beerId: string; waterId: string }
}

let ctx: RouteTestCtx
let s: Seeded

async function runJson<T = unknown>(qs: string, staffId: string): Promise<T> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/admin/events/[id]/reports.get')).default
  const { event } = makeEvent({ method: 'GET', url: `/api/admin/events/${s.eventId}/reports${qs}` })
  event.context.params = { id: s.eventId }
  event.context.auth = { staff: { staffId, role: 'admin', username: 'admin' } }
  return await handler(event) as T
}

function insertGuestOrder(tableNo: number, createdAt: string): string {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${s.eventId}', ${tableNo}, now() + interval '1 day') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id, created_at)
     VALUES ('${s.eventId}', ${tableNo}, '${guestId}', '${createdAt}') RETURNING id`,
  ) as { id: string }).id
  return orderId
}

function insertItem(orderId: string, menuItemId: string, qty: number, priceCents: number, station: 'kitchen' | 'bar') {
  return (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${menuItemId}', ${qty}, ${priceCents}, '${station}') RETURNING id`,
  ) as { id: string }).id
}

function insertPayment(staffId: string, totalCents: number, itemIds: string[]) {
  const pid = (ctx.mem.public.one(
    `INSERT INTO payments (event_id, staff_id, total_cents) VALUES ('${s.eventId}', '${staffId}', ${totalCents}) RETURNING id`,
  ) as { id: string }).id
  for (const oi of itemIds) {
    ctx.mem.public.none(
      `INSERT INTO payment_items (payment_id, order_item_id) VALUES ('${pid}', '${oi}')`,
    )
    ctx.mem.public.none(`UPDATE order_items SET payment_status='paid' WHERE id='${oi}'`)
  }
  return pid
}

function voidItem(itemId: string, reason: string, staffId: string) {
  ctx.mem.public.none(
    `UPDATE order_items
       SET production_status='cancelled', void_reason='${reason}', voided_by_staff='${staffId}', voided_at=now()
       WHERE id='${itemId}'`,
  )
}

describe('US5 aggregations — integration', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)

    // Event
    const eventId = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
       VALUES ('Demo', 'DEMO1', 1, 20, true) RETURNING id`,
    ) as { id: string }).id
    const adminId = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('admin', 'h', 'admin') RETURNING id`,
    ) as { id: string }).id
    const waiterId = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('waiter1', 'h', 'waiter') RETURNING id`,
    ) as { id: string }).id

    const insertMenu = (nameDe: string, nameEn: string, price: number, cat: string, station: 'kitchen' | 'bar') =>
      (ctx.mem.public.one(
        `INSERT INTO menu_items (event_id, name_de, name_en, price_cents, category, station)
         VALUES ('${eventId}', '${nameDe}', '${nameEn}', ${price}, '${cat}', '${station}') RETURNING id`,
      ) as { id: string }).id

    const friesId = insertMenu('Pommes', 'Fries', 350, 'food', 'kitchen')
    const burgerId = insertMenu('Burger', 'Burger', 800, 'food', 'kitchen')
    const beerId = insertMenu('Bier', 'Beer', 400, 'drink', 'bar')
    const waterId = insertMenu('Wasser', 'Water', 200, 'drink', 'bar')

    s = { eventId, adminId, waiterId, items: { friesId, burgerId, beerId, waterId } }

    // 6 orders across two hour buckets
    const h1a = '2026-06-01T18:10:00Z'
    const h1b = '2026-06-01T18:30:00Z'
    const h1c = '2026-06-01T18:45:00Z'
    const h2a = '2026-06-01T19:05:00Z'
    const h2b = '2026-06-01T19:20:00Z'
    const h2c = '2026-06-01T19:50:00Z'

    // Order 1 (table 1, 18:10): 2× fries (700), 1× beer (400) — both paid by waiter
    const o1 = insertGuestOrder(1, h1a)
    const o1f = insertItem(o1, friesId, 2, 350, 'kitchen')
    const o1b = insertItem(o1, beerId, 1, 400, 'bar')

    // Order 2 (table 2, 18:30): 1× burger (800), 2× beer (800)
    const o2 = insertGuestOrder(2, h1b)
    const o2br = insertItem(o2, burgerId, 1, 800, 'kitchen')
    const o2b = insertItem(o2, beerId, 2, 400, 'bar')

    // Order 3 (table 3, 18:45): 1× water (200) — VOIDED
    const o3 = insertGuestOrder(3, h1c)
    const o3w = insertItem(o3, waterId, 1, 200, 'bar')
    voidItem(o3w, 'kunde abgelehnt', waiterId)

    // Order 4 (table 4, 19:05): 3× fries (1050)
    const o4 = insertGuestOrder(4, h2a)
    const o4f = insertItem(o4, friesId, 3, 350, 'kitchen')

    // Order 5 (table 5, 19:20): 1× beer (400), 1× water (200)
    const o5 = insertGuestOrder(5, h2b)
    const _o5b = insertItem(o5, beerId, 1, 400, 'bar')
    const _o5w = insertItem(o5, waterId, 1, 200, 'bar')

    // Order 6 (table 6, 19:50): 2× burger (1600)
    const o6 = insertGuestOrder(6, h2c)
    const _o6br = insertItem(o6, burgerId, 2, 800, 'kitchen')

    // Payments:
    //   p1 (waiter): items o1f + o1b = 1100
    //   p2 (waiter): items o2br + o2b = 1600 (partial: leaves none here, but admin will handle later)
    //   p3 (admin):  items o4f       = 1050
    insertPayment(waiterId, 1100, [o1f, o1b])
    insertPayment(waiterId, 1600, [o2br, o2b])
    insertPayment(adminId, 1050, [o4f])
    // o5b, o5w, o6br remain unpaid — that's the "partial" scenario across event totals
  })

  it('revenue_by_category sums paid items only (no open, voided or refunded ones)', async () => {
    type R = { rows: RevenueByCategoryRow[] }
    const res = await runJson<R>('?type=revenue_by_category', s.adminId)
    const byCat = Object.fromEntries(res.rows.map((r) => [r.category, r]))
    // paid food = 2*350 + 1*800 + 3*350 = 2550 (6 items); open o6 burgers don't count
    expect(byCat.food).toEqual({ category: 'food', totalCents: 2550, itemCount: 6 })
    // paid drink = 1*400 + 2*400 = 1200 (3 items); open o5 and voided water don't count
    expect(byCat.drink).toEqual({ category: 'drink', totalCents: 1200, itemCount: 3 })
    // Adds up with the cash collected (no deposit in this event).
    const staff = await runJson<{ rows: PaymentsByStaffRow[] }>('?type=payments_by_staff', s.adminId)
    const sum = (rows: Array<{ totalCents: number }>) => rows.reduce((a, r) => a + r.totalCents, 0)
    expect(sum(res.rows)).toBe(sum(staff.rows))
  })

  it('top_items orders by quantity desc, paid items only', async () => {
    type R = { rows: TopItemRow[] }
    const res = await runJson<R>('?type=top_items', s.adminId)
    // paid: fries 2+3=5, beer 1+2=3, burger 1
    expect(res.rows.map((r) => [r.nameEn, r.quantity])).toEqual([
      ['Fries', 5],
      ['Beer', 3],
      ['Burger', 1],
    ])
    expect(res.rows.length).toBeLessThanOrEqual(10)
  })

  it('refunds and trial payments stay out of revenue, consistent with payments per staff', async () => {
    const o = insertGuestOrder(7, '2026-06-01T20:00:00Z')
    const beer = insertItem(o, s.items.beerId, 1, 400, 'bar')
    const fries = insertItem(o, s.items.friesId, 1, 350, 'kitchen')
    const pid = insertPayment(s.waiterId, 750, [beer, fries])
    // Admin refunds the beer: item cancelled, refund row on that payment.
    voidItem(beer, 'zu warm', s.adminId)
    ctx.mem.public.none(
      `INSERT INTO refunds (event_id, order_item_id, payment_id, staff_id, amount_cents, reason)
       VALUES ('${s.eventId}', '${beer}', '${pid}', '${s.adminId}', 400, 'zu warm')`,
    )
    // A rehearsal payment never counts.
    const t = insertGuestOrder(8, '2026-06-01T20:05:00Z')
    const trialBurger = insertItem(t, s.items.burgerId, 1, 800, 'kitchen')
    const tp = insertPayment(s.waiterId, 800, [trialBurger])
    ctx.mem.public.none(`UPDATE payments SET is_trial = true WHERE id = '${tp}'`)

    const rev = await runJson<{ rows: RevenueByCategoryRow[] }>('?type=revenue_by_category', s.adminId)
    const byCat = Object.fromEntries(rev.rows.map((r) => [r.category, r]))
    expect(byCat.food).toEqual({ category: 'food', totalCents: 2550 + 350, itemCount: 7 })
    expect(byCat.drink).toEqual({ category: 'drink', totalCents: 1200, itemCount: 3 })
    const staff = await runJson<{ rows: PaymentsByStaffRow[] }>('?type=payments_by_staff', s.adminId)
    const sum = (rows: Array<{ totalCents: number }>) => rows.reduce((a, r) => a + r.totalCents, 0)
    expect(sum(rev.rows)).toBe(sum(staff.rows))
    const top = await runJson<{ rows: TopItemRow[] }>('?type=top_items', s.adminId)
    expect(top.rows.find((r) => r.nameEn === 'Beer')!.quantity).toBe(3)
  })

  it('reports name and category as ordered, even after the menu entry changed', async () => {
    const o = insertGuestOrder(9, '2026-06-01T20:00:00Z')
    const item = insertItem(o, s.items.waterId, 2, 200, 'bar')
    ctx.mem.public.none(`UPDATE order_items SET name_de = 'Wasser', name_en = 'Water', category = 'drink' WHERE id = '${item}'`)
    insertPayment(s.waiterId, 400, [item])
    // Mid-event the article is renamed and moved to another category.
    ctx.mem.public.none(`UPDATE menu_items SET name_de = 'Sprudel', name_en = 'Sparkling', category = 'soft' WHERE id = '${s.items.waterId}'`)

    const rev = await runJson<{ rows: RevenueByCategoryRow[] }>('?type=revenue_by_category', s.adminId)
    expect(rev.rows.map((r) => r.category).sort()).toEqual(['drink', 'food'])
    const top = await runJson<{ rows: TopItemRow[] }>('?type=top_items', s.adminId)
    expect(top.rows.find((r) => r.menuItemId === s.items.waterId)).toMatchObject({ nameDe: 'Wasser', nameEn: 'Water', quantity: 2 })
  })

  it('voids returns voided items with reason + staff', async () => {
    type R = { rows: VoidRow[] }
    const res = await runJson<R>('?type=voids', s.adminId)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]!.reason).toBe('kunde abgelehnt')
    expect(res.rows[0]!.voidedByStaffId).toBe(s.waiterId)
    expect(res.rows[0]!.nameEn).toBe('Water')
  })

  it('payments_by_staff sums each staffs payments', async () => {
    type R = { rows: PaymentsByStaffRow[] }
    const res = await runJson<R>('?type=payments_by_staff', s.adminId)
    const byStaff = Object.fromEntries(res.rows.map((r) => [r.username, r]))
    expect(byStaff.waiter1!.paymentCount).toBe(2)
    expect(byStaff.waiter1!.totalCents).toBe(2700)
    expect(byStaff.admin!.paymentCount).toBe(1)
    expect(byStaff.admin!.totalCents).toBe(1050)
  })

  it('orders_per_hour buckets by local hour in Europe/Berlin', async () => {
    // Winter time (UTC+1) next to the summer orders (UTC+2) of the seed.
    insertGuestOrder(10, '2026-01-10T18:10:00Z')
    type R = { rows: OrdersPerHourRow[] }
    const res = await runJson<R>('?type=orders_per_hour', s.adminId)
    expect(res.rows).toEqual([
      { hour: '2026-01-10T19:00', orderCount: 1, guestOrderCount: 1 },
      { hour: '2026-06-01T20:00', orderCount: 3, guestOrderCount: 3 },
      { hour: '2026-06-01T21:00', orderCount: 3, guestOrderCount: 3 },
    ])
  })
})
