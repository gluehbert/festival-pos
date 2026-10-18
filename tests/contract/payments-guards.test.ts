import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)

function placeOrder(tableNo: number, quantity: number): string {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  const menuId = seeded.menuItemIds[0]!
  const m = ctx.mem.public.one(
    `SELECT price_cents, station FROM menu_items WHERE id='${menuId}'`,
  ) as { price_cents: number; station: string }
  return (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${menuId}', ${quantity}, ${m.price_cents}, '${m.station}') RETURNING id`,
  ) as { id: string }).id
}

async function pay(ticketKey: string, orderItemIds: string[], quantities?: Record<string, number>) {
  const { makeEvent } = await import('../setup/h3-event')
  ctx.setBody({ ticketKey, orderItemIds, ...(quantities ? { quantities } : {}) })
  const handler = (await import('../../server/api/payments/index.post')).default
  const { event } = makeEvent({
    method: 'POST',
    cookies: { csrf: CSRF },
    headers: { 'x-csrf-token': CSRF },
  })
  event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
  return handler(event)
}

describe('POST /api/payments guards', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('rejects a full payment when the line was partly paid in between', async () => {
    const itemId = placeOrder(5, 5)
    // Read state: quantity 5. Meanwhile 2 of them get paid by someone else.
    ctx.mem.public.none(`UPDATE order_items SET quantity = 3 WHERE id = '${itemId}'`)
    const { settleLines } = await import('../../server/lib/payment-settle')
    const { getDb } = await import('../../server/db/client')
    await expect(
      getDb().transaction((tx) => settleLines(tx, [{ orderItemId: itemId, quantity: 5, payQuantity: 5 }])),
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' })
    const status = (ctx.mem.public.one(`SELECT payment_status FROM order_items WHERE id='${itemId}'`) as { payment_status: string }).payment_status
    expect(status).toBe('unpaid')
    expect(ctx.mem.public.many(`SELECT id FROM payments`).length).toBe(0)
  })

  it('blocks a second payment by the same cashier while a lock is active', async () => {
    const itemId = placeOrder(6, 1)
    ctx.mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at)
       VALUES ('${seeded.eventId}', 6, '${seeded.staffId}', now() + interval '60 seconds')`,
    )
    await expect(pay('t-6', [itemId])).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'LOCK_CONFLICT' },
    })
    expect(ctx.mem.public.many(`SELECT id FROM payments`).length).toBe(0)
  })
})
