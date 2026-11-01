import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)

async function seedItem(tableNo: number, menuIdx: number): Promise<string> {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at) VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  const menuId = seeded.menuItemIds[menuIdx]!
  const m = ctx.mem.public.one(`SELECT price_cents, station FROM menu_items WHERE id='${menuId}'`) as { price_cents: number; station: string }
  return (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${menuId}', 1, ${m.price_cents}, '${m.station}') RETURNING id`,
  ) as { id: string }).id
}

async function queueAs(role: 'kitchen' | 'bar' | 'cafe') {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/production/queue.get')).default
  const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: role } }
  return await handler(event) as { station: string; items: Array<{ tableNo: number }> }
}

async function patchAs(role: 'kitchen' | 'bar' | 'cafe', id: string, nextStatus: string) {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/production/items/[id].patch')).default
  ctx.setBody({ nextStatus })
  const { event } = makeEvent({ method: 'PATCH', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: role } }
  event.context.params = { id }
  return await handler(event) as { productionStatus: string }
}

describe('cafe station (cake and coffee counter)', () => {
  let cakeItem: string

  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, {
      items: [
        { nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'food', station: 'kitchen' },
        { nameDe: 'Kuchen', nameEn: 'Cake', priceCents: 300, category: 'cafe', station: 'cafe' },
      ],
    })
    await seedItem(1, 0)
    cakeItem = await seedItem(2, 1)
  })

  it('shows the cafe role only its own items, and the kitchen none of them', async () => {
    const cafe = await queueAs('cafe')
    expect(cafe.station).toBe('cafe')
    expect(cafe.items.map((i) => i.tableNo)).toEqual([2])
    expect((await queueAs('kitchen')).items.map((i) => i.tableNo)).toEqual([1])
  })

  it('lets the cafe counter finish a slice at once, but not the kitchen', async () => {
    await expect(patchAs('kitchen', cakeItem, 'done')).rejects.toMatchObject({ statusCode: 403 })
    expect((await patchAs('cafe', cakeItem, 'done')).productionStatus).toBe('done')
  })
})
