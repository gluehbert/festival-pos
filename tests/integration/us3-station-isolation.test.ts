import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

async function seedItem(tableNo: number, menuIdx: number): Promise<string> {
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
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${menuId}', 1, ${m.price_cents}, '${m.station}') RETURNING id`,
  ) as { id: string }
  return row.id
}

describe('US3 — station isolation', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    // 3 kitchen + 3 bar items
    for (const t of [1, 2, 3]) await seedItem(t, 0) // kitchen
    for (const t of [4, 5, 6]) await seedItem(t, 1) // bar
  })

  it('kitchen role sees only kitchen items', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    const r = await handler(event) as { station: string; items: Array<{ tableNo: number }> }
    expect(r.station).toBe('kitchen')
    expect(r.items.length).toBe(3)
    expect(r.items.map((i) => i.tableNo).sort()).toEqual([1, 2, 3])
  })

  it('bar role sees only bar items', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'bar', username: 'b' } }
    const r = await handler(event) as { station: string; items: Array<{ tableNo: number }> }
    expect(r.station).toBe('bar')
    expect(r.items.length).toBe(3)
    expect(r.items.map((i) => i.tableNo).sort()).toEqual([4, 5, 6])
  })

  it('admin sees both stations via separate queries', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/production/queue.get')).default
    const { event: e1 } = makeEvent({ method: 'GET', url: '/api/production/queue?station=kitchen' })
    e1.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    const r1 = await handler(e1) as { items: unknown[] }
    expect(r1.items.length).toBe(3)

    const { event: e2 } = makeEvent({ method: 'GET', url: '/api/production/queue?station=bar' })
    e2.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    const r2 = await handler(e2) as { items: unknown[] }
    expect(r2.items.length).toBe(3)
  })
})
