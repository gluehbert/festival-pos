import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
function csrf() {
  return { cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } }
}

async function placeOrder(tableNo: number, indexes: number[]): Promise<{ orderId: string; itemIds: string[] }> {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  const itemIds: string[] = []
  for (const idx of indexes) {
    const menuId = seeded.menuItemIds[idx]!
    const m = ctx.mem.public.one(
      `SELECT price_cents, station FROM menu_items WHERE id='${menuId}'`,
    ) as { price_cents: number; station: string }
    const row = ctx.mem.public.one(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
       VALUES ('${orderId}', '${menuId}', 1, ${m.price_cents}, '${m.station}') RETURNING id`,
    ) as { id: string }
    itemIds.push(row.id)
  }
  return { orderId, itemIds }
}

describe('POST /api/payments', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('creates payment, marks items paid, releases lock, returns ticketStatusAfter=paid', async () => {
    const { itemIds } = await placeOrder(3, [0, 1])
    const { makeEvent } = await import('../setup/h3-event')
    const { PaymentResponseSchema } = await import('../../server/lib/contracts/staff')
    const c = csrf()
    ctx.setBody({ ticketKey: 't-3', orderItemIds: itemIds })
    const handler = (await import('../../server/api/payments/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const r = await handler(event)
    const p = PaymentResponseSchema.parse(r)
    expect(p.ticketStatusAfter).toBe('paid')
    expect(p.totalCents).toBe(350 + 400)

    // items marked paid
    const rows = ctx.mem.public.many(`SELECT payment_status FROM order_items`)
    expect(rows.every((r) => (r as { payment_status: string }).payment_status === 'paid')).toBe(true)
    // lock removed
    const locks = ctx.mem.public.many(`SELECT id FROM payment_locks`)
    expect(locks.length).toBe(0)
    // payment_items created
    const pi = ctx.mem.public.many(`SELECT order_item_id FROM payment_items`)
    expect(pi.length).toBe(2)
    // audit log
    const audit = ctx.mem.public.many(`SELECT action FROM audit_log`)
    expect(audit.length).toBe(1)
    expect((audit[0] as { action: string }).action).toBe('payment')
  })

  it('rejects concurrent payment with 409 LOCK_CONFLICT', async () => {
    const { itemIds } = await placeOrder(4, [0, 1])
    // Manually insert a lock by another staff
    const otherStaff = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('other', 'h', 'waiter') RETURNING id`,
    ) as { id: string }).id
    ctx.mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at)
       VALUES ('${seeded.eventId}', 4, '${otherStaff}', now() + interval '60 seconds')`,
    )

    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ ticketKey: 't-4', orderItemIds: itemIds })
    const handler = (await import('../../server/api/payments/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'LOCK_CONFLICT' },
    })
  })

  it('returns ticketStatusAfter=open when partial payment', async () => {
    const { itemIds } = await placeOrder(8, [0, 1])
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ ticketKey: 't-8', orderItemIds: [itemIds[0]!] })
    const handler = (await import('../../server/api/payments/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    const r = await handler(event) as { ticketStatusAfter: string }
    expect(r.ticketStatusAfter).toBe('open')
  })

  it('rejects without CSRF', async () => {
    const { itemIds } = await placeOrder(9, [0])
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ ticketKey: 't-9', orderItemIds: itemIds })
    const handler = (await import('../../server/api/payments/index.post')).default
    const { event } = makeEvent({ method: 'POST' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    await expect(handler(event)).rejects.toThrow(/CSRF/)
  })

  it('rejects when role is kitchen', async () => {
    const { itemIds } = await placeOrder(10, [0])
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ ticketKey: 't-10', orderItemIds: itemIds })
    const handler = (await import('../../server/api/payments/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('POST /api/payments/{lockId}/release', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('owner can release a lock', async () => {
    const lockId = (ctx.mem.public.one(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at)
       VALUES ('${seeded.eventId}', 1, '${seeded.staffId}', now() + interval '60 seconds') RETURNING id`,
    ) as { id: string }).id
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    const handler = (await import('../../server/api/payments/[id]/release.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    event.context.params = { id: lockId }
    const r = await handler(event)
    expect(r).toEqual({ ok: true })
    const left = ctx.mem.public.many(`SELECT id FROM payment_locks`)
    expect(left.length).toBe(0)
  })
})
