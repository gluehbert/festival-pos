import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)

async function call(
  route: 'orders' | 'payments',
  body: Record<string, unknown>,
  opts: { key?: string; staffId?: string; guest?: boolean } = {},
): Promise<{ status: number; res: Record<string, unknown> | null; code?: string }> {
  const { makeEvent } = await import('../setup/h3-event')
  ctx.setBody(body)
  const handler = (await import(`../../server/api/${route}/index.post.ts`)).default
  const headers: Record<string, string> = { 'x-csrf-token': CSRF }
  if (opts.key) headers['idempotency-key'] = opts.key
  const { event } = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers })
  if (opts.guest) event.context.guest = ctx.guest
  else event.context.auth = { staff: { staffId: opts.staffId ?? seeded.staffId, role: 'waiter', username: 'w' } }
  try {
    const res = await handler(event) as Record<string, unknown>
    return { status: event.node.res.statusCode, res }
  }
  catch (err) {
    const e = err as { statusCode: number; data?: { code?: string } }
    return { status: e.statusCode, res: null, code: e.data?.code }
  }
}

function addWaiter(name: string): string {
  return (ctx.mem.public.one(
    `INSERT INTO staff (username, pin_hash, role) VALUES ('${name}', 'h', 'waiter') RETURNING id`,
  ) as { id: string }).id
}

const count = (sql: string) => Number((ctx.mem.public.one(sql) as { n: number }).n)

describe('idempotent payments and orders, guest limits', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('a payment retried with the same key after a lost answer is booked once', async () => {
    const order = await call('orders', {
      tableNo: 5, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 4 }],
    }, { key: 'o1' })
    const lineId = (order.res!.items as Array<{ orderItemId: string }>)[0]!.orderItemId
    const pay = { ticketKey: 't-5', orderItemIds: [lineId], quantities: { [lineId]: 2 } }

    const first = await call('payments', pay, { key: 'p1' })
    expect(first.status).toBe(201)
    const retry = await call('payments', pay, { key: 'p1' })
    expect(retry.status).toBe(200)
    expect(retry.res).toMatchObject({ paymentId: first.res!.paymentId, totalCents: 800, ticketStatusAfter: 'open' })

    expect(count(`SELECT COUNT(*)::int AS n FROM payments`)).toBe(1)
    expect(count(`SELECT COALESCE(SUM(quantity), 0)::int AS n FROM order_items WHERE payment_status = 'unpaid'`)).toBe(2)

    // A new key is a new payment: the other two beers.
    const rest = await call('payments', { ticketKey: 't-5', orderItemIds: [lineId] }, { key: 'p2' })
    expect(rest.res).toMatchObject({ totalCents: 800, ticketStatusAfter: 'paid' })
  })

  it('a payment retried after an aborted answer gets the booked payment back, even with a lock on the table', async () => {
    const order = await call('orders', {
      tableNo: 5, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 2 }],
    }, { key: 'o1' })
    const lineId = (order.res!.items as Array<{ orderItemId: string }>)[0]!.orderItemId
    const pay = { ticketKey: 't-5', orderItemIds: [lineId] }

    const first = await call('payments', pay, { key: 'p1' })
    expect(first.status).toBe(201)
    // The lock is released in the booking's finally: the retry meets none.
    expect(count(`SELECT COUNT(*)::int AS n FROM payment_locks`)).toBe(0)

    // Even if a lock was active (second tab), the booked payment is found first.
    ctx.mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at)
       VALUES ('${seeded.eventId}', 5, '${seeded.staffId}', now() + interval '60 seconds')`,
    )
    const retry = await call('payments', pay, { key: 'p1' })
    expect(retry.status).toBe(200)
    expect(retry.res).toMatchObject({ paymentId: first.res!.paymentId })
    expect(count(`SELECT COUNT(*)::int AS n FROM payments`)).toBe(1)
  })

  it('a staff order sent twice with the same key is created once, per waiter', async () => {
    const body = { tableNo: 7, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] }
    const a = await call('orders', body, { key: 'same' })
    const b = await call('orders', body, { key: 'same' })
    expect(b.status).toBe(200)
    expect(b.res!.orderId).toBe(a.res!.orderId)

    // The database refuses a duplicate even if two retries race past the lookup.
    expect(() => ctx.mem.public.none(
      `INSERT INTO orders (event_id, table_no, kind, created_by_staff, idempotency_key)
       VALUES ('${seeded.eventId}', 7, 'staff_table', '${seeded.staffId}', 'same')`,
    )).toThrow()

    // Another waiter's key never returns this waiter's order.
    const other = await call('orders', body, { key: 'same', staffId: addWaiter('kim') })
    expect(other.status).toBe(201)
    expect(other.res!.orderId).not.toBe(a.res!.orderId)
  })

  it('limits guests: order size and orders per table', async () => {
    const guestId = (ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 3, now() + interval '7 days') RETURNING id`,
    ) as { id: string }).id
    ctx.setGuest({ sessionId: guestId, eventId: seeded.eventId, tableNo: 3 })
    const order = (quantity: number, key: string) =>
      call('orders', { tableNo: 3, items: [{ menuItemId: seeded.menuItemIds[1]!, quantity }] }, { key, guest: true })

    expect(await order(41, 'big')).toMatchObject({ status: 400, code: 'ORDER_TOO_LARGE' })
    for (let i = 0; i < 15; i++) {
      expect((await order(1, `g${i}`)).status).toBe(201)
    }
    // A retry of an order already placed still gets its answer.
    expect((await order(1, 'g14')).status).toBe(200)
    expect(await order(1, 'g15')).toMatchObject({ status: 429, code: 'RATE_LIMITED' })

    // Waiters can still order for that table.
    const staff = await call('orders', {
      tableNo: 3, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 50 }],
    }, { key: 's1' })
    expect(staff.status).toBe(201)
  })
})
