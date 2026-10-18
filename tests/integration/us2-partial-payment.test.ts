import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

describe('US2 partial payment — integration', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('pay 2 of 4 items leaves ticket open; pay remaining 2 closes it; audit logged twice', async () => {
    // Build table 6 with 4 items, 2 from each menu entry
    const guestId = (ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 6, now() + interval '7 days') RETURNING id`,
    ) as { id: string }).id
    const orderId = (ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', 6, '${guestId}') RETURNING id`,
    ) as { id: string }).id
    const itemIds: string[] = []
    for (let i = 0; i < 4; i++) {
      const idx = i % 2
      const menuId = seeded.menuItemIds[idx]!
      const m = ctx.mem.public.one(
        `SELECT price_cents, station FROM menu_items WHERE id='${menuId}'`,
      ) as { price_cents: number; station: string }
      const r = ctx.mem.public.one(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
         VALUES ('${orderId}', '${menuId}', 1, ${m.price_cents}, '${m.station}') RETURNING id`,
      ) as { id: string }
      itemIds.push(r.id)
    }

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/payments/index.post')).default
    const c = csrf()

    // First payment: items [0,1]
    ctx.setBody({ ticketKey: 't-6', orderItemIds: itemIds.slice(0, 2) })
    const { event: ev1 } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    ev1.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const r1 = await handler(ev1) as { ticketStatusAfter: string; totalCents: number }
    expect(r1.ticketStatusAfter).toBe('open')
    expect(r1.totalCents).toBe(350 + 400)

    // Verify ticket is still open via tickets endpoint
    const tickets = (await import('../../server/api/tickets/index.get')).default
    const { event: tev1 } = makeEvent({ method: 'GET' })
    tev1.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const tl1 = await tickets(tev1) as { tickets: Array<{ ticketKey: string; status: string; unpaidCents: number }> }
    const t6a = tl1.tickets.find((t) => t.ticketKey === 't-6')!
    expect(t6a.status).toBe('open')
    expect(t6a.unpaidCents).toBe(350 + 400)

    // Second payment: items [2,3]
    ctx.setBody({ ticketKey: 't-6', orderItemIds: itemIds.slice(2, 4) })
    const { event: ev2 } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    ev2.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const r2 = await handler(ev2) as { ticketStatusAfter: string }
    expect(r2.ticketStatusAfter).toBe('paid')

    const audit = ctx.mem.public.many(`SELECT action, staff_id, payload FROM audit_log ORDER BY created_at`) as Array<{
      action: string
      staff_id: string
      payload: unknown
    }>
    expect(audit.length).toBe(2)
    expect(audit.every((r) => r.action === 'payment')).toBe(true)
    expect(audit.every((r) => r.staff_id === seeded.staffId)).toBe(true)
  })
})
