import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

function refundEvent(role: 'admin' | 'waiter', id: string) {
  const e = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  e.event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'a' } }
  e.event.context.params = { id }
  return e.event
}

function orderItem(paid: boolean): string {
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${seeded.eventId}', 2, 'walkin', '${seeded.staffId}') RETURNING id`,
  ) as { id: string }).id
  const itemId = (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, payment_status)
     VALUES ('${orderId}', '${seeded.menuItemIds[0]}', 2, 350, 'kitchen', '${paid ? 'paid' : 'unpaid'}') RETURNING id`,
  ) as { id: string }).id
  if (paid) {
    const paymentId = (ctx.mem.public.one(
      `INSERT INTO payments (event_id, staff_id, total_cents) VALUES ('${seeded.eventId}', '${seeded.staffId}', 700) RETURNING id`,
    ) as { id: string }).id
    ctx.mem.public.none(`INSERT INTO payment_items (payment_id, order_item_id) VALUES ('${paymentId}', '${itemId}')`)
  }
  return itemId
}

describe('POST /api/admin/order-items/:id/refund', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('refunds a paid item once and cancels it', async () => {
    const handler = (await import('../../server/api/admin/order-items/[id]/refund.post')).default
    const id = orderItem(true)
    ctx.setBody({ reason: 'kalt serviert' })
    await expect(handler(refundEvent('admin', id))).resolves.toMatchObject({ orderItemId: id, amountCents: 700 })
    expect(ctx.mem.public.one(`SELECT production_status FROM order_items WHERE id='${id}'`)).toEqual({ production_status: 'cancelled' })
    expect(ctx.mem.public.many(`SELECT action FROM audit_log`)).toEqual([{ action: 'refund' }])
    await expect(handler(refundEvent('admin', id))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects unpaid items, non-admins, short reasons and bad ids', async () => {
    const handler = (await import('../../server/api/admin/order-items/[id]/refund.post')).default
    ctx.setBody({ reason: 'kalt serviert' })
    await expect(handler(refundEvent('admin', orderItem(false)))).rejects.toMatchObject({ statusCode: 409 })
    await expect(handler(refundEvent('waiter', orderItem(true)))).rejects.toMatchObject({ statusCode: 403 })
    await expect(handler(refundEvent('admin', 'nope'))).rejects.toMatchObject({ statusCode: 400 })
    ctx.setBody({ reason: 'x' })
    await expect(handler(refundEvent('admin', orderItem(true)))).rejects.toMatchObject({ statusCode: 400 })
  })
})
