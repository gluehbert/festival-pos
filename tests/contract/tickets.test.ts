import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let waiter: { staffId: string; role: 'waiter'; username: string }

function makeWaiter(staffId: string) {
  return { staffId, role: 'waiter' as const, username: 'w' }
}

async function placeGuestOrder(tableNo: number, idx = 0, qty = 1) {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  const menuId = seeded.menuItemIds[idx]!
  const m = ctx.mem.public.one(
    `SELECT price_cents, station FROM menu_items WHERE id='${menuId}'`,
  ) as { price_cents: number; station: string }
  ctx.mem.public.none(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${menuId}', ${qty}, ${m.price_cents}, '${m.station}')`,
  )
  return { orderId, guestId }
}

describe('GET /api/tickets', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    waiter = makeWaiter(seeded.staffId)
  })

  it('requires waiter or admin role', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/tickets/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })

    const { event: ev2 } = makeEvent({ method: 'GET' })
    ev2.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    await expect(handler(ev2)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lists open tickets with totals', async () => {
    await placeGuestOrder(3, 0, 2) // 2x350 = 700
    await placeGuestOrder(3, 1, 1) // 1x400 = 400
    await placeGuestOrder(5, 0, 1) // 350

    const { makeEvent } = await import('../setup/h3-event')
    const { TicketsListSchema } = await import('../../server/lib/contracts/staff')
    const handler = (await import('../../server/api/tickets/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: waiter }
    const result = await handler(event)
    const parsed = TicketsListSchema.parse(result)
    expect(parsed.tickets.length).toBe(2)
    const t3 = parsed.tickets.find((t) => t.tableNo === 3)!
    expect(t3.ticketKey).toBe('t-3')
    expect(t3.unpaidCents).toBe(1100)
    expect(t3.totalCents).toBe(1100)
    expect(t3.status).toBe('open')
    expect(t3.lockedBy).toBeNull()
  })

  it('filters by station=kitchen', async () => {
    await placeGuestOrder(2, 0) // kitchen item
    await placeGuestOrder(4, 1) // bar item

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/tickets/index.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/tickets?station=kitchen' })
    event.context.auth = { staff: waiter }
    const r = await handler(event) as { tickets: Array<{ tableNo: number }> }
    expect(r.tickets.map((t) => t.tableNo).sort()).toEqual([2])
  })

  it('shows walk-in ticket with w-<orderId> key', async () => {
    // create walk-in directly
    const orderId = (ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${seeded.eventId}', 0, 'walkin', '${seeded.staffId}') RETURNING id`,
    ) as { id: string }).id
    const m = ctx.mem.public.one(
      `SELECT price_cents, station FROM menu_items WHERE id='${seeded.menuItemIds[0]}'`,
    ) as { price_cents: number; station: string }
    ctx.mem.public.none(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
       VALUES ('${orderId}', '${seeded.menuItemIds[0]}', 1, ${m.price_cents}, '${m.station}')`,
    )

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/tickets/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: waiter }
    const r = await handler(event) as { tickets: Array<{ ticketKey: string; tableNo: number }> }
    expect(r.tickets.find((t) => t.ticketKey === `w-${orderId}`)).toBeDefined()
  })

  it('sums each ticket from all its items: paid, ready and per walk-in', async () => {
    const one = (q: string) => ctx.mem.public.one(q) as { id: string }
    const addItem = (orderId: string, opts: { station: string; qty: number; paid?: boolean; done?: boolean }) =>
      ctx.mem.public.none(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, deposit_cents, station, payment_status, production_status)
         VALUES ('${orderId}', '${seeded.menuItemIds[0]}', ${opts.qty}, 300, 100, '${opts.station}',
                 '${opts.paid ? 'paid' : 'unpaid'}', '${opts.done ? 'done' : 'pending'}')`,
      )
    const order = (kind: string) => one(
      `INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${seeded.eventId}', ${kind === 'walkin' ? 0 : 3}, '${kind}', '${seeded.staffId}') RETURNING id`,
    ).id
    const first = order('staff_table')
    addItem(first, { station: 'kitchen', qty: 2, paid: true, done: true }) // paid: not the waiter's to bring
    addItem(first, { station: 'bar', qty: 1, done: true })
    addItem(order('staff_table'), { station: 'kitchen', qty: 3, done: true })
    const walkA = order('walkin')
    addItem(walkA, { station: 'kitchen', qty: 1, paid: true, done: true })
    const walkB = order('walkin')
    addItem(walkB, { station: 'bar', qty: 2 })

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/tickets/index.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/tickets?status=all' })
    event.context.auth = { staff: waiter }
    const r = await handler(event) as { tickets: Array<{ ticketKey: string; status: string; totalCents: number; unpaidCents: number; ready: { kitchen: number; bar: number }; assignee: { staffId: string } | null }> }
    const byKey = new Map(r.tickets.map((t) => [t.ticketKey, t]))
    expect(r.tickets).toHaveLength(3)
    expect(byKey.get('t-3')).toMatchObject({ status: 'open', totalCents: 2400, unpaidCents: 1600, ready: { kitchen: 3, bar: 1 }, assignee: null })
    expect(byKey.get(`w-${walkA}`)).toMatchObject({ status: 'paid', totalCents: 400, unpaidCents: 0, ready: { kitchen: 1, bar: 0 } })
    expect(byKey.get(`w-${walkA}`)!.assignee?.staffId).toBe(seeded.staffId)
    expect(byKey.get(`w-${walkB}`)).toMatchObject({ status: 'open', totalCents: 800, unpaidCents: 800, ready: { kitchen: 0, bar: 0 } })
  })
})

describe('GET /api/tickets/{id}', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    waiter = makeWaiter(seeded.staffId)
  })

  it('returns table ticket detail with all items', async () => {
    await placeGuestOrder(7, 0, 2)
    await placeGuestOrder(7, 1, 1)
    const { makeEvent } = await import('../setup/h3-event')
    const { TicketDetailSchema } = await import('../../server/lib/contracts/staff')
    const handler = (await import('../../server/api/tickets/[id].get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: waiter }
    event.context.params = { id: 't-7' }
    const r = await handler(event)
    const p = TicketDetailSchema.parse(r)
    expect(p.ticketKey).toBe('t-7')
    expect(p.tableNo).toBe(7)
    expect(p.items.length).toBe(2)
    expect(p.unpaidCents).toBe(1100)
  })

  it('hides expired locks without deleting them (no sweep on polls)', async () => {
    await placeGuestOrder(4)
    await placeGuestOrder(5)
    ctx.mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at)
       VALUES ('${seeded.eventId}', 4, '${seeded.staffId}', now() - interval '1 second'),
              ('${seeded.eventId}', 5, '${seeded.staffId}', now() + interval '60 seconds')`,
    )
    const { makeEvent } = await import('../setup/h3-event')
    const detail = (await import('../../server/api/tickets/[id].get')).default
    const list = (await import('../../server/api/tickets/index.get')).default
    const lockedBy = async (id: string) => {
      const { event } = makeEvent({ method: 'GET' })
      event.context.auth = { staff: waiter }
      event.context.params = { id }
      return (await detail(event) as { lockedBy: string | null }).lockedBy
    }
    expect(await lockedBy('t-4')).toBeNull()
    expect(await lockedBy('t-5')).toBe(seeded.staffId)

    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: waiter }
    const r = await list(event) as { tickets: Array<{ ticketKey: string; lockedBy: string | null }> }
    expect(r.tickets.find((t) => t.ticketKey === 't-4')?.lockedBy).toBeNull()
    expect(r.tickets.find((t) => t.ticketKey === 't-5')?.lockedBy).toBe(seeded.staffId)
    expect(ctx.mem.public.many(`SELECT table_no FROM payment_locks ORDER BY table_no`)).toEqual([{ table_no: 4 }, { table_no: 5 }])
  })

  it('returns 404 for unknown ticket', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/tickets/[id].get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: waiter }
    event.context.params = { id: 't-999' }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 400 for malformed key', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/tickets/[id].get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: waiter }
    event.context.params = { id: 'garbage' }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
  })
})
