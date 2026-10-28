import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

async function seedItem(
  tableNo: number,
  menuIdx: number,
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' = 'pending',
): Promise<string> {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  const menuId = seeded.menuItemIds[menuIdx]!
  const m = ctx.mem.public.one(
    `SELECT price_cents, station FROM menu_items WHERE id='${menuId}'`,
  ) as { price_cents: number; station: string }
  const row = ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, production_status)
     VALUES ('${orderId}', '${menuId}', 1, ${m.price_cents}, '${m.station}', '${status}') RETURNING id`,
  ) as { id: string }
  return row.id
}

async function patch(id: string, nextStatus: 'in_progress' | 'done', role: 'kitchen' | 'bar' = 'kitchen') {
  const { makeEvent } = await import('../setup/h3-event')
  const c = csrf()
  ctx.setBody({ nextStatus })
  const handler = (await import('../../server/api/production/items/[id].patch')).default
  const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'k' } }
  event.context.params = { id }
  return handler(event)
}

describe('US3 — state machine transitions', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('pending → in_progress → done is allowed', async () => {
    const id = await seedItem(1, 0, 'pending')
    const r1 = await patch(id, 'in_progress') as { productionStatus: string }
    expect(r1.productionStatus).toBe('in_progress')
    const r2 = await patch(id, 'done') as { productionStatus: string }
    expect(r2.productionStatus).toBe('done')
  })

  it('pending → done (skip in_progress) is rejected with 409 in the kitchen', async () => {
    const id = await seedItem(1, 0, 'pending')
    await expect(patch(id, 'done')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('the bar may skip in_progress: pending → done', async () => {
    const id = await seedItem(1, 1, 'pending')
    const r = await patch(id, 'done', 'bar') as { productionStatus: string }
    expect(r.productionStatus).toBe('done')
  })

  it('cancelled items never appear in queue', async () => {
    await seedItem(1, 0, 'pending')
    await seedItem(2, 0, 'cancelled')
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    const r = await handler(event) as { items: Array<{ tableNo: number }> }
    expect(r.items.length).toBe(1)
    expect(r.items[0]!.tableNo).toBe(1)
  })

  it('done items disappear from queue after final transition', async () => {
    const id = await seedItem(1, 0, 'pending')
    await patch(id, 'in_progress')
    await patch(id, 'done')
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    const r = await handler(event) as { items: unknown[] }
    expect(r.items.length).toBe(0)
  })

  it('done → in_progress (undo) brings the item back until it is served', async () => {
    const id = await seedItem(1, 0, 'done')
    expect(await patch(id, 'in_progress')).toMatchObject({ productionStatus: 'in_progress' })
    const { makeEvent } = await import('../setup/h3-event')
    const queue = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    expect(((await queue(event)) as { items: Array<{ orderItemId: string }> }).items.map((i) => i.orderItemId)).toEqual([id])

    const served = await seedItem(2, 0, 'done')
    ctx.mem.public.none(`UPDATE order_items SET served_at = now() WHERE id = '${served}'`)
    await expect(patch(served, 'in_progress')).rejects.toMatchObject({ statusCode: 409, data: { code: 'ALREADY_SERVED' } })
    expect(ctx.mem.public.one(`SELECT production_status FROM order_items WHERE id = '${served}'`)).toEqual({ production_status: 'done' })
  })
})
