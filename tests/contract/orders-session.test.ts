import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[] }
let guestA: { id: string }
let guestB: { id: string }

describe('GET /api/orders/session', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    guestA = ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 4, now() + interval '7 days') RETURNING id`,
    ) as { id: string }
    guestB = ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 4, now() + interval '7 days') RETURNING id`,
    ) as { id: string }
    // Order for A: 2 fries at 350 = 700
    const oA = ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', 4, '${guestA.id}') RETURNING id`,
    ) as { id: string }
    ctx.mem.public.none(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
       VALUES ('${oA.id}', '${seeded.menuItemIds[0]}', 2, 350, 'kitchen')`,
    )
    // Order for B: 1 beer at 400 = 400
    const oB = ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', 4, '${guestB.id}') RETURNING id`,
    ) as { id: string }
    ctx.mem.public.none(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
       VALUES ('${oB.id}', '${seeded.menuItemIds[1]}', 1, 400, 'bar')`,
    )
  })

  it('returns only caller\'s items but table-wide balance', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { SessionOrdersSchema } = await import('../../server/lib/contracts/guest')
    const handler = (await import('../../server/api/orders/session.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.guest = { sessionId: guestA.id, eventId: seeded.eventId, tableNo: 4 }
    const result = await handler(event)
    const parsed = SessionOrdersSchema.parse(result)
    expect(parsed.tableNo).toBe(4)
    expect(parsed.items.length).toBe(1)
    expect(parsed.items[0]!.quantity).toBe(2)
    expect(parsed.tableBalanceCents).toBe(700 + 400)
    expect(parsed.ticketStatus).toBe('open')
  })

  it('reports ticketStatus paid when all unpaid items zero and at least one paid', async () => {
    // Mark all items paid
    ctx.mem.public.none(`UPDATE order_items SET payment_status = 'paid'`)

    const { makeEvent } = await import('../setup/h3-event')
    const { SessionOrdersSchema } = await import('../../server/lib/contracts/guest')
    const handler = (await import('../../server/api/orders/session.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.guest = { sessionId: guestA.id, eventId: seeded.eventId, tableNo: 4 }
    const result = await handler(event)
    const parsed = SessionOrdersSchema.parse(result)
    expect(parsed.ticketStatus).toBe('paid')
    expect(parsed.tableBalanceCents).toBe(0)
  })

  it('leaves walk-in counter sales with the same table number off the guest bill', async () => {
    const waiter = ctx.mem.public.one(
      `INSERT INTO staff (username, pin_hash, role) VALUES ('w-walk', 'h', 'waiter') RETURNING id`,
    ) as { id: string }
    const walk = ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, kind, created_by_staff)
       VALUES ('${seeded.eventId}', 4, 'walkin', '${waiter.id}') RETURNING id`,
    ) as { id: string }
    ctx.mem.public.none(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
       VALUES ('${walk.id}', '${seeded.menuItemIds[1]}', 3, 400, 'bar')`,
    )
    const { makeEvent } = await import('../setup/h3-event')
    const { SessionOrdersSchema } = await import('../../server/lib/contracts/guest')
    const handler = (await import('../../server/api/orders/session.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.guest = { sessionId: guestA.id, eventId: seeded.eventId, tableNo: 4 }
    const parsed = SessionOrdersSchema.parse(await handler(event))
    expect(parsed.tableBalanceCents).toBe(700 + 400)

    // Table items all paid, walk-in still open: the guest ticket is paid.
    ctx.mem.public.none(`UPDATE order_items SET payment_status = 'paid' WHERE order_id <> '${walk.id}'`)
    const again = makeEvent({ method: 'GET' }).event
    again.context.guest = { sessionId: guestA.id, eventId: seeded.eventId, tableNo: 4 }
    const paid = SessionOrdersSchema.parse(await handler(again))
    expect(paid.tableBalanceCents).toBe(0)
    expect(paid.ticketStatus).toBe('paid')
  })

  it('requires a guest session', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/orders/session.get')).default
    const { event } = makeEvent({ method: 'GET' })
    await expect(handler(event)).rejects.toThrow(/UNAUTHORIZED|Guest session/i)
  })
})
