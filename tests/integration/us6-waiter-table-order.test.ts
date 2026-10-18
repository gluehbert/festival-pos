import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
type Role = 'waiter' | 'admin' | 'kitchen' | 'bar'

async function staffOrder(
  body: Record<string, unknown>,
  opts: { role?: Role; key?: string } = {},
): Promise<{ status: number; res: unknown }> {
  const { makeEvent } = await import('../setup/h3-event')
  const c = csrf()
  ctx.setBody(body)
  const handler = (await import('../../server/api/orders/index.post')).default
  const headers: Record<string, string> = { ...c.headers }
  if (opts.key) headers['idempotency-key'] = opts.key
  const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers })
  event.context.auth = { staff: { staffId: seeded.staffId, role: opts.role ?? 'waiter', username: 'w' } }
  try {
    const out = await handler(event)
    return { status: event.node.res.statusCode, res: out }
  }
  catch (err) {
    return { status: (err as { statusCode: number }).statusCode, res: null }
  }
}

function guestOrder(tableNo: number, menuItemId: string): string {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  return (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${menuItemId}', 1, 400, 'bar') RETURNING id`,
  ) as { id: string }).id
}

async function getTicket(key: string): Promise<{ items: Array<{ orderItemId: string }>; unpaidCents: number }> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/tickets/[id].get')).default
  const { event } = makeEvent({ method: 'GET' })
  event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
  event.context.params = { id: key }
  return await handler(event) as { items: Array<{ orderItemId: string }>; unpaidCents: number }
}

describe('US6 waiter takes an order for a table — integration', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('adds the waiter order to the same table ticket as the guest order, both can be cashed together', async () => {
    const guestItem = guestOrder(7, seeded.menuItemIds[1]!)
    const { status, res } = await staffOrder({
      tableNo: 7,
      mode: 'staff_table',
      items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 2 }],
    })
    expect(status).toBe(201)
    const order = res as { orderId: string; items: Array<{ orderItemId: string }>; tableBalanceCents: number }
    expect(order.tableBalanceCents).toBeGreaterThan(400)

    const row = ctx.mem.public.one(`SELECT kind, created_by_staff FROM orders WHERE id='${order.orderId}'`) as {
      kind: string
      created_by_staff: string
    }
    expect(row).toEqual({ kind: 'staff_table', created_by_staff: seeded.staffId })

    const { makeEvent } = await import('../setup/h3-event')
    const listHandler = (await import('../../server/api/tickets/index.get')).default
    const { event: listEv } = makeEvent({ method: 'GET' })
    listEv.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const list = await listHandler(listEv) as { tickets: Array<{ ticketKey: string }> }
    expect(list.tickets.map((t) => t.ticketKey)).toEqual(['t-7'])

    const ticket = await getTicket('t-7')
    const ids = ticket.items.map((i) => i.orderItemId)
    expect(ids).toContain(guestItem)
    expect(ids).toContain(order.items[0]!.orderItemId)

    const c = csrf()
    ctx.setBody({ ticketKey: 't-7', orderItemIds: ids })
    const payHandler = (await import('../../server/api/payments/index.post')).default
    const { event: payEv } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    payEv.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const paid = await payHandler(payEv) as { ticketStatusAfter: string }
    expect(paid.ticketStatusAfter).toBe('paid')
  })

  it('accepts table numbers outside the event range (tables without QR code)', async () => {
    const { status } = await staffOrder({
      tableNo: 99,
      mode: 'staff_table',
      items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }],
    })
    expect(status).toBe(201)
    expect((await getTicket('t-99')).items).toHaveLength(1)
  })

  it('rejects table 0, kitchen/bar staff and replays the same idempotency key', async () => {
    const items = [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }]
    expect((await staffOrder({ tableNo: 0, mode: 'staff_table', items })).status).toBe(400)
    expect((await staffOrder({ tableNo: 3, mode: 'staff_table', items }, { role: 'kitchen' })).status).toBe(403)

    const first = await staffOrder({ tableNo: 3, mode: 'staff_table', items }, { key: 'k-1' })
    const again = await staffOrder({ tableNo: 3, mode: 'staff_table', items }, { key: 'k-1' })
    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect((again.res as { orderId: string }).orderId).toBe((first.res as { orderId: string }).orderId)
  })

  it('mode walkin still creates its own ticket that table payments cannot touch', async () => {
    const { res } = await staffOrder({
      tableNo: 7,
      mode: 'walkin',
      items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }],
    })
    const walk = res as { orderId: string; items: Array<{ orderItemId: string }> }
    const ticket = await getTicket(`w-${walk.orderId}`)
    expect(ticket.items).toHaveLength(1)
    await expect(getTicket('t-7')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('cashes part of a line: 2 of 5 beers now, the other 3 later', async () => {
    const { res } = await staffOrder({
      tableNo: 4,
      mode: 'staff_table',
      items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 5 }],
    })
    const lineId = (res as { items: Array<{ orderItemId: string; unitPriceCents: number }> }).items[0]!
    const pay = async (body: Record<string, unknown>) => {
      const { makeEvent } = await import('../setup/h3-event')
      const c = csrf()
      ctx.setBody({ ticketKey: 't-4', ...body })
      const handler = (await import('../../server/api/payments/index.post')).default
      const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
      event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
      return await handler(event) as { totalCents: number; ticketStatusAfter: string }
    }

    await expect(pay({ orderItemIds: [lineId.orderItemId], quantities: { [lineId.orderItemId]: 6 } }))
      .rejects.toMatchObject({ statusCode: 400 })

    const first = await pay({ orderItemIds: [lineId.orderItemId], quantities: { [lineId.orderItemId]: 2 } })
    expect(first).toMatchObject({ totalCents: 2 * lineId.unitPriceCents, ticketStatusAfter: 'open' })

    const ticket = await getTicket('t-4') as unknown as {
      unpaidCents: number
      items: Array<{ orderItemId: string; quantity: number; paymentStatus: string }>
    }
    expect(ticket.unpaidCents).toBe(3 * lineId.unitPriceCents)
    expect(ticket.items.map((i) => [i.quantity, i.paymentStatus]).sort()).toEqual([[2, 'paid'], [3, 'unpaid']])

    const second = await pay({ orderItemIds: [lineId.orderItemId] })
    expect(second).toMatchObject({ totalCents: 3 * lineId.unitPriceCents, ticketStatusAfter: 'paid' })
    const sum = ctx.mem.public.one(`SELECT sum(total_cents) AS s FROM payments`) as { s: number }
    expect(Number(sum.s)).toBe(5 * lineId.unitPriceCents)
  })
})
