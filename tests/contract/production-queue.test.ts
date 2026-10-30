import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

async function seedOrderItem(
  tableNo: number,
  menuIdx: number,
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' = 'pending',
  offsetSeconds = 0,
): Promise<string> {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id, created_at)
     VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}', now() + interval '${offsetSeconds} seconds') RETURNING id`,
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

describe('GET /api/production/queue', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('returns kitchen items in orderedAt ASC for kitchen role; hides done/cancelled', async () => {
    // seed kitchen items at table 3,1,2 with increasing offsets; one done, one cancelled
    await seedOrderItem(3, 0, 'pending', 10) // newest
    await seedOrderItem(1, 0, 'pending', 0) // oldest
    await seedOrderItem(2, 0, 'in_progress', 5) // middle
    await seedOrderItem(4, 0, 'done', 1) // hidden
    await seedOrderItem(5, 0, 'cancelled', 2) // hidden
    // bar item that must not appear
    await seedOrderItem(6, 1, 'pending', 3)

    const { makeEvent } = await import('../setup/h3-event')
    const { ProductionQueueSchema } = await import('../../server/lib/contracts/production')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }

    const r = await handler(event)
    const parsed = ProductionQueueSchema.parse(r)
    expect(parsed.station).toBe('kitchen')
    expect(parsed.items.length).toBe(3)
    expect(parsed.items.map((i) => i.tableNo)).toEqual([1, 2, 3])
    expect(parsed.items.every((i) => ['pending', 'in_progress'].includes(i.productionStatus))).toBe(true)
  })

  it('lists the items of one order in menu order, the same on every poll', async () => {
    const guestId = (ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at) VALUES ('${seeded.eventId}', 4, now() + interval '7 days') RETURNING id`,
    ) as { id: string }).id
    const orderId = (ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', 4, '${guestId}') RETURNING id`,
    ) as { id: string }).id
    const kitchen = ctx.mem.public.many(`SELECT id, name_en FROM menu_items WHERE event_id = '${seeded.eventId}'`) as Array<{ id: string; name_en: string }>
    expect(kitchen.length).toBeGreaterThan(1)
    // Menu order: reverse of the insertion order below.
    kitchen.forEach((m, n) => ctx.mem.public.none(`UPDATE menu_items SET sort_order = ${100 - n} WHERE id = '${m.id}'`))
    for (const m of kitchen) {
      ctx.mem.public.none(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station) VALUES ('${orderId}', '${m.id}', 1, 100, 'kitchen')`)
    }

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    const r = await handler(event) as { items: Array<{ nameEn: string }> }
    expect(r.items.map((i) => i.nameEn)).toEqual(kitchen.map((m) => m.name_en).reverse())
  })

  it('kitchen role ignores station=bar query and still returns kitchen', async () => {
    await seedOrderItem(1, 0, 'pending', 0) // kitchen
    await seedOrderItem(2, 1, 'pending', 0) // bar

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/production/queue?station=bar' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }

    const r = await handler(event) as { station: string; items: Array<{ tableNo: number }> }
    expect(r.station).toBe('kitchen')
    expect(r.items.map((i) => i.tableNo)).toEqual([1])
  })

  it('admin requires station query', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('admin can select bar', async () => {
    await seedOrderItem(1, 0, 'pending', 0) // kitchen
    await seedOrderItem(2, 1, 'pending', 0) // bar
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/production/queue?station=bar' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    const r = await handler(event) as { station: string; items: Array<{ tableNo: number }> }
    expect(r.station).toBe('bar')
    expect(r.items.map((i) => i.tableNo)).toEqual([2])
  })

  it('rejects waiter role', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects unauthenticated', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
  })
})
