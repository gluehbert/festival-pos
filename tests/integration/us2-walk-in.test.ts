import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

describe('US2 walk-in order — integration', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('staff creates a walk-in order; created_by_staff set, guest_session_id null', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({
      tableNo: 0,
      createWalkin: true,
      items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }],
    })
    const handler = (await import('../../server/api/orders/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const r = await handler(event) as { orderId: string }

    const row = ctx.mem.public.one(
      `SELECT created_by_staff, guest_session_id, table_no FROM orders WHERE id='${r.orderId}'`,
    ) as { created_by_staff: string | null; guest_session_id: string | null; table_no: number }
    expect(row.created_by_staff).toBe(seeded.staffId)
    expect(row.guest_session_id).toBeNull()
    expect(row.table_no).toBe(0)
  })

  it('walk-in shows up in GET /api/tickets with ticketKey w-<orderId>; no table-0 aggregation with table tickets', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()

    // Create a walk-in
    ctx.setBody({
      tableNo: 0,
      createWalkin: true,
      items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }],
    })
    const orderHandler = (await import('../../server/api/orders/index.post')).default
    const { event: ev1 } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    ev1.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const walkin = await orderHandler(ev1) as { orderId: string }

    // Create a guest order on table 4
    const guestId = (ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 4, now() + interval '7 days') RETURNING id`,
    ) as { id: string }).id
    const orderId = (ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', 4, '${guestId}') RETURNING id`,
    ) as { id: string }).id
    const m = ctx.mem.public.one(
      `SELECT price_cents, station FROM menu_items WHERE id='${seeded.menuItemIds[1]}'`,
    ) as { price_cents: number; station: string }
    ctx.mem.public.none(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
       VALUES ('${orderId}', '${seeded.menuItemIds[1]}', 1, ${m.price_cents}, '${m.station}')`,
    )

    const ticketsHandler = (await import('../../server/api/tickets/index.get')).default
    const { event: ev2 } = makeEvent({ method: 'GET' })
    ev2.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const r = await ticketsHandler(ev2) as { tickets: Array<{ ticketKey: string; tableNo: number }> }

    const walkTicket = r.tickets.find((t) => t.ticketKey === `w-${walkin.orderId}`)
    const tableTicket = r.tickets.find((t) => t.ticketKey === 't-4')
    expect(walkTicket).toBeDefined()
    expect(tableTicket).toBeDefined()
    // No t-0 aggregation collapsing into the walk-in
    expect(r.tickets.find((t) => t.ticketKey === 't-0')).toBeUndefined()
  })
})
