import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[] }

async function csrfHeaders() {
  const token = 'a'.repeat(64)
  return {
    cookies: { csrf: token },
    headers: { 'x-csrf-token': token },
  }
}

describe('POST /api/orders', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    // create a guest session row
    const guestId = (ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 3, now() + interval '7 days') RETURNING id`,
    ) as { id: string }).id
    ctx.setGuest({ sessionId: guestId, eventId: seeded.eventId, tableNo: 3 })
  })

  it('CreateOrderSchema enforces quantity bounds', async () => {
    const { CreateOrderSchema } = await import('../../server/lib/contracts/guest')
    expect(() => CreateOrderSchema.parse({ tableNo: 1, items: [] })).toThrow()
    expect(() => CreateOrderSchema.parse({
      tableNo: 1,
      items: [{ menuItemId: '00000000-0000-0000-0000-000000000000', quantity: 0 }],
    })).toThrow()
  })

  it('creates an order with computed tableBalanceCents and OrderSchema shape', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { OrderSchema } = await import('../../server/lib/contracts/guest')
    const csrf = await csrfHeaders()
    ctx.setBody({
      tableNo: 3,
      items: [
        { menuItemId: seeded.menuItemIds[0]!, quantity: 2 },
        { menuItemId: seeded.menuItemIds[1]!, quantity: 1 },
      ],
    })
    const handler = (await import('../../server/api/orders/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: csrf.cookies, headers: { ...csrf.headers, 'idempotency-key': 'kA' } })
    event.context.guest = ctx.guest
    const result = await handler(event)
    const parsed = OrderSchema.parse(result)
    expect(parsed.tableNo).toBe(3)
    expect(parsed.items.length).toBe(2)
    // 2*350 + 1*400 = 1100
    expect(parsed.tableBalanceCents).toBe(1100)
    expect(parsed.items.every((i) => i.productionStatus === 'pending' && i.paymentStatus === 'unpaid')).toBe(true)
  })

  it('identical Idempotency-Key returns the same orderId', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const csrf = await csrfHeaders()
    const body = {
      tableNo: 3,
      items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }],
    }
    ctx.setBody(body)
    const handler = (await import('../../server/api/orders/index.post')).default
    const ev1 = makeEvent({ method: 'POST', cookies: csrf.cookies, headers: { ...csrf.headers, 'idempotency-key': 'same' } })
    ev1.event.context.guest = ctx.guest
    const r1 = await handler(ev1.event) as { orderId: string }
    const ev2 = makeEvent({ method: 'POST', cookies: csrf.cookies, headers: { ...csrf.headers, 'idempotency-key': 'same' } })
    ev2.event.context.guest = ctx.guest
    const r2 = await handler(ev2.event) as { orderId: string }
    expect(r1.orderId).toBe(r2.orderId)
  })

  it('rejects when CSRF missing', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ tableNo: 3, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] })
    const handler = (await import('../../server/api/orders/index.post')).default
    const { event } = makeEvent({ method: 'POST' })
    event.context.guest = ctx.guest
    await expect(handler(event)).rejects.toThrow(/CSRF/)
  })

  it('rejects when guest tries to order for a different table', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const csrf = await csrfHeaders()
    ctx.setBody({ tableNo: 7, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] })
    const handler = (await import('../../server/api/orders/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: csrf.cookies, headers: csrf.headers })
    event.context.guest = ctx.guest
    await expect(handler(event)).rejects.toThrow(/different table|FORBIDDEN/i)
  })

  it('rejects unavailable items', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const csrf = await csrfHeaders()
    const hiddenId = seeded.menuItemIds[2]! // seeded as is_available=false
    ctx.setBody({ tableNo: 3, items: [{ menuItemId: hiddenId, quantity: 1 }] })
    const handler = (await import('../../server/api/orders/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: csrf.cookies, headers: csrf.headers })
    event.context.guest = ctx.guest
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409, data: { code: 'SOLD_OUT', details: { menuItemIds: [hiddenId] } } })
  })
})
