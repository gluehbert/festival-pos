import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

async function placeOrder(tableNo: number, idx = 0): Promise<{ orderId: string; itemId: string }> {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  const m = ctx.mem.public.one(
    `SELECT price_cents, station FROM menu_items WHERE id='${seeded.menuItemIds[idx]}'`,
  ) as { price_cents: number; station: string }
  const itemId = (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${seeded.menuItemIds[idx]}', 1, ${m.price_cents}, '${m.station}') RETURNING id`,
  ) as { id: string }).id
  return { orderId, itemId }
}

describe('US2 payment lock — integration', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('second cashier on same ticket gets 409 with lockedBy + expiresAt; expiry frees lock', async () => {
    const a = await placeOrder(2, 0)
    const b = await placeOrder(2, 1)
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/payments/index.post')).default
    const c = csrf()

    // Insert lock by another staff so first call conflicts (simulate concurrent)
    const otherStaff = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('other', 'h', 'waiter') RETURNING id`,
    ) as { id: string }).id
    ctx.mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at)
       VALUES ('${seeded.eventId}', 2, '${otherStaff}', now() + interval '60 seconds')`,
    )

    // Second cashier tries → 409
    ctx.setBody({ ticketKey: 't-2', orderItemIds: [a.itemId, b.itemId] })
    const { event: ev1 } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    ev1.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'me' } }
    try {
      await handler(ev1)
      throw new Error('should have thrown')
    }
    catch (err: unknown) {
      const e = err as { statusCode?: number; data?: { code?: string; details?: { lockedBy?: string; expiresAt?: string } } }
      expect(e.statusCode).toBe(409)
      expect(e.data?.code).toBe('LOCK_CONFLICT')
      expect(e.data?.details?.lockedBy).toBe(otherStaff)
      expect(typeof e.data?.details?.expiresAt).toBe('string')
    }

    // Simulate auto-release: expire the lock in the DB
    ctx.mem.public.none(
      `UPDATE payment_locks SET expires_at = now() - interval '1 second' WHERE staff_id='${otherStaff}'`,
    )

    ctx.setBody({ ticketKey: 't-2', orderItemIds: [a.itemId, b.itemId] })
    const { event: ev2 } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    ev2.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'me' } }
    const r = await handler(ev2) as { ticketStatusAfter: string }
    expect(r.ticketStatusAfter).toBe('paid')
    // The route replaced the expired lock itself (no sweep) and released its own.
    expect(ctx.mem.public.many(`SELECT id FROM payment_locks`)).toEqual([])
  })
})
