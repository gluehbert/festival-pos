import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { installCommonMocks, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { freshDatabase, testDatabaseUrl, type RealPg } from '../setup/real-pg'
import { makeEvent } from '../setup/h3-event'

const url = testDatabaseUrl()
const CSRF = 'a'.repeat(64)

let real: RealPg
let ctx: RouteTestCtx
let eventId: string
let waiterId: string
let menuIds: string[]

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const res = await real.db.execute(query)
  return res.rows[0] as T
}

function staffEvent(role: 'waiter' | 'kitchen' | 'lead' | 'admin', headers: Record<string, string> = {}, staffId = waiterId) {
  const e = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF, ...headers } })
  e.event.context.auth = { staff: { staffId, role, username: role } }
  return e
}

async function guestOrder(tableNo: number, items: Array<{ menuItemId: string; quantity: number }>, key?: string) {
  const session = await one<{ id: string }>(sql`
    INSERT INTO guest_sessions (event_id, table_no, expires_at)
    VALUES (${eventId}, ${tableNo}, now() + interval '1 day') RETURNING id`)
  ctx.setBody({ tableNo, items })
  const handler = (await import('../../server/api/orders/index.post')).default
  const e = makeEvent({
    method: 'POST',
    cookies: { csrf: CSRF },
    headers: { 'x-csrf-token': CSRF, ...(key ? { 'idempotency-key': key } : {}) },
  })
  e.event.context.guest = { sessionId: session.id, eventId, tableNo }
  return await handler(e.event) as { orderId: string; items: Array<{ orderItemId: string }> }
}

describe.skipIf(!url)('real Postgres: migrations + order/payment flow', () => {
  beforeAll(async () => {
    await installCommonMocks()
    real = await freshDatabase(url!)
    ctx = {
      mem: undefined as never,
      db: real.db,
      body: undefined,
      setBody(b) { ctx.body = b },
      setGuest(g) { ctx.guest = g },
    }
    setCtx(ctx)
    eventId = (await one<{ id: string }>(sql`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
      VALUES ('PG Fest', 'PG1', 1, 20, true) RETURNING id`)).id
    waiterId = (await one<{ id: string }>(sql`
      INSERT INTO staff (username, password_hash, role) VALUES ('w', 'h', 'waiter') RETURNING id`)).id
    const rows = await real.db.execute(sql`
      INSERT INTO menu_items (event_id, name_de, name_en, price_cents, category, station)
      VALUES (${eventId}, 'Pommes', 'Fries', 350, 'food', 'kitchen'),
             (${eventId}, 'Bier', 'Beer', 450, 'drink', 'bar')
      RETURNING id`)
    menuIds = rows.rows.map((r) => (r as { id: string }).id)
  })

  afterAll(async () => {
    await real?.pool.end()
  })

  it('places a guest order inside a real transaction', async () => {
    const order = await guestOrder(4, [{ menuItemId: menuIds[0]!, quantity: 2 }, { menuItemId: menuIds[1]!, quantity: 1 }])
    expect(order.items).toHaveLength(2)
    const count = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM order_items WHERE order_id = ${order.orderId}`)
    expect(count.n).toBe(2)
  })

  it('deduplicates concurrent retries with the same Idempotency-Key', async () => {
    const session = await one<{ id: string }>(sql`
      INSERT INTO guest_sessions (event_id, table_no, expires_at)
      VALUES (${eventId}, 6, now() + interval '1 day') RETURNING id`)
    ctx.setBody({ tableNo: 6, items: [{ menuItemId: menuIds[0]!, quantity: 1 }] })
    const handler = (await import('../../server/api/orders/index.post')).default
    const fire = () => {
      const e = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF, 'idempotency-key': 'same' } })
      e.event.context.guest = { sessionId: session.id, eventId, tableNo: 6 }
      return handler(e.event) as Promise<{ orderId: string }>
    }
    const results = await Promise.all([fire(), fire(), fire()])
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1)
  })

  it('pays a table ticket and rejects paying the same items twice', async () => {
    const order = await guestOrder(9, [{ menuItemId: menuIds[1]!, quantity: 2 }])
    const handler = (await import('../../server/api/payments/index.post')).default
    ctx.setBody({ ticketKey: 't-9', orderItemIds: order.items.map((i) => i.orderItemId) })
    const paid = await handler(staffEvent('waiter').event) as { totalCents: number; ticketStatusAfter: string }
    expect(paid.totalCents).toBe(900)
    expect(paid.ticketStatusAfter).toBe('paid')

    await expect(handler(staffEvent('waiter').event)).rejects.toMatchObject({ statusCode: 409 })
    const locks = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM payment_locks`)
    expect(locks.n).toBe(0)
  })

  it('does not void an item that has been paid', async () => {
    const order = await guestOrder(11, [{ menuItemId: menuIds[0]!, quantity: 1 }])
    const pay = (await import('../../server/api/payments/index.post')).default
    ctx.setBody({ ticketKey: 't-11', orderItemIds: [order.items[0]!.orderItemId] })
    await pay(staffEvent('waiter').event)

    const voidHandler = (await import('../../server/api/order-items/[id]/void.post')).default
    ctx.setBody({ reason: 'Gast hat storniert' })
    const ev = staffEvent('waiter').event
    ev.context.params = { id: order.items[0]!.orderItemId }
    await expect(voidHandler(ev)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('refunds a paid item: cancelled, recorded once, reports net of refunds', async () => {
    const order = await guestOrder(12, [{ menuItemId: menuIds[1]!, quantity: 2 }, { menuItemId: menuIds[0]!, quantity: 1 }])
    const pay = (await import('../../server/api/payments/index.post')).default
    ctx.setBody({ ticketKey: 't-12', orderItemIds: order.items.map((i) => i.orderItemId) })
    await pay(staffEvent('waiter').event)

    const refund = (await import('../../server/api/admin/order-items/[id]/refund.post')).default
    const beerId = order.items[0]!.orderItemId
    // The lead refunds from their own drawer, not the waiter's.
    const leadId = (await one<{ id: string }>(sql`
      INSERT INTO staff (username, password_hash, role) VALUES ('lead', 'h', 'lead') RETURNING id`)).id
    const call = (role: 'admin' | 'waiter', id: string) => {
      const e = staffEvent(role, {}, leadId)
      e.event.context.params = { id }
      return refund(e.event)
    }
    ctx.setBody({ reason: 'Bier war warm' })
    await expect(call('waiter', beerId)).rejects.toMatchObject({ statusCode: 403 })
    await expect(call('admin', beerId)).rejects.toMatchObject({ statusCode: 409, data: { code: 'CASH_SESSION_REQUIRED' } })
    await real.db.execute(sql`INSERT INTO cash_sessions (event_id, staff_id, opening_cents) VALUES (${eventId}, ${leadId}, 1000)`)
    await expect(call('admin', beerId)).resolves.toMatchObject({ amountCents: 900 })
    await expect(call('admin', beerId)).rejects.toMatchObject({ statusCode: 409 })

    const unpaid = await guestOrder(13, [{ menuItemId: menuIds[0]!, quantity: 1 }])
    ctx.setBody({ reason: 'Gast ist gegangen' })
    await expect(call('admin', unpaid.items[0]!.orderItemId)).rejects.toMatchObject({ statusCode: 409 })

    const { loadPaymentsByStaff, loadVoids, loadRevenueByCategory } = await import('../../server/lib/reports')
    const voids = await loadVoids(real.db as never, eventId)
    expect(voids.find((v) => v.orderItemId === beerId)).toMatchObject({ refundedCents: 900, reason: 'Bier war warm' })
    const perStaff = await loadPaymentsByStaff(real.db as never, eventId)
    expect(perStaff.find((r) => r.staffId === waiterId)).toMatchObject({ refundedCents: 0 })
    expect(perStaff.find((r) => r.staffId === leadId)).toMatchObject({ refundedCents: 900, totalCents: -900 })
    const gross = (await one<{ n: number }>(sql`SELECT COALESCE(SUM(total_cents),0)::int AS n FROM payments`)).n
    expect(perStaff.reduce((a, r) => a + r.totalCents, 0)).toBe(gross - 900)
    const revenue = await loadRevenueByCategory(real.db as never, eventId)
    // Revenue counts paid items only, the open order 13 not.
    const paid = (await one<{ n: number }>(sql`
      SELECT COALESCE(SUM(quantity * unit_price_cents),0)::int AS n FROM order_items
      WHERE production_status <> 'cancelled' AND payment_status = 'paid'`)).n
    expect(revenue.reduce((s, r) => s + r.totalCents, 0)).toBe(paid)
  })

  it('buckets orders per local Berlin hour in SQL, across DST', async () => {
    const other = (await one<{ id: string }>(sql`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to) VALUES ('Alt', 'PG2', 1, 5) RETURNING id`)).id
    for (const at of ['2026-01-10T18:10:00Z', '2026-01-10T18:50:00Z', '2026-07-04T16:30:00Z', '2026-10-25T00:30:00Z']) {
      await real.db.execute(sql`
        INSERT INTO orders (event_id, table_no, kind, created_by_staff, created_at)
        VALUES (${other}, 1, 'staff_table', ${waiterId}, ${at}::timestamptz)`)
    }
    const { loadOrdersPerHour } = await import('../../server/lib/reports')
    expect(await loadOrdersPerHour(real.db as never, other)).toEqual([
      { hour: '2026-01-10T19:00', orderCount: 2, guestOrderCount: 0 },
      { hour: '2026-07-04T18:00', orderCount: 1, guestOrderCount: 0 },
      { hour: '2026-10-25T02:00', orderCount: 1, guestOrderCount: 0 },
    ])
  })

  it('sweeps expired sessions without breaking orders that reference them', async () => {
    await real.db.execute(sql`UPDATE guest_sessions SET expires_at = now() - interval '1 minute'`)
    const { sweep } = await import('../../server/lib/sweep')
    const result = await sweep(real.db as never)
    expect(result.expiredGuestSessions).toBe(0)
    const orphaned = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM orders WHERE guest_session_id IS NULL AND created_by_staff IS NULL`)
    expect(orphaned.n).toBe(0)
  })

  it('lets only one of several parallel callers claim the sweep', async () => {
    const { claimSweep } = await import('../../server/lib/sweep')
    const claims = await Promise.all(Array.from({ length: 5 }, () => claimSweep(real.db as never)))
    expect(claims.filter(Boolean)).toHaveLength(1)
  })

  it('counts guest sign-ins per table and reports app usage', async () => {
    const handler = (await import('../../server/api/session.post')).default
    for (let i = 0; i < 2; i++) {
      ctx.setBody({ tableNo: 15, pin: 'PG1' })
      await handler(makeEvent({ method: 'POST' }).event)
    }
    await guestOrder(15, [{ menuItemId: menuIds[1]!, quantity: 2 }])
    await guestOrder(15, [{ menuItemId: menuIds[1]!, quantity: 1 }])
    const { loadAppUsage } = await import('../../server/lib/reports-usage')
    const row = (await loadAppUsage(real.db as never, eventId)).find((r) => r.tableNo === 15)
    expect(row).toEqual({ tableNo: 15, scans: 2, orderingDevices: 2, guestOrders: 2, staffOrders: 0, guestItems: 3, staffItems: 0 })
  })

  it('maps validation errors to 400 instead of 500', async () => {
    ctx.setBody({ tableNo: 4, items: [] })
    const handler = (await import('../../server/api/orders/index.post')).default
    const e = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
    await expect(handler(e.event)).rejects.toMatchObject({ statusCode: 400 })
  })
})
