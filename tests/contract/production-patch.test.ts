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

describe('PATCH /api/production/items/{id}', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('allows pending → in_progress for kitchen role', async () => {
    const id = await seedItem(1, 0, 'pending')
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ nextStatus: 'in_progress' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    event.context.params = { id }
    const r = await handler(event) as { orderItemId: string; productionStatus: string }
    expect(r.productionStatus).toBe('in_progress')
    const row = ctx.mem.public.one(`SELECT production_status FROM order_items WHERE id='${id}'`) as { production_status: string }
    expect(row.production_status).toBe('in_progress')
  })

  it('allows in_progress → done', async () => {
    const id = await seedItem(1, 0, 'in_progress')
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ nextStatus: 'done' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    event.context.params = { id }
    const r = await handler(event) as { productionStatus: string }
    expect(r.productionStatus).toBe('done')
  })

  it('rejects reopening a served item and done → done with 409', async () => {
    const id = await seedItem(1, 0, 'done')
    ctx.mem.public.none(`UPDATE order_items SET served_at = now() WHERE id = '${id}'`)
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ nextStatus: 'in_progress' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    event.context.params = { id }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409 })

    const open = await seedItem(2, 0, 'done')
    ctx.setBody({ nextStatus: 'done' })
    const again = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers }).event
    again.context.auth = event.context.auth
    again.context.params = { id: open }
    await expect(handler(again)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('cancelled items reject any transition (409)', async () => {
    const id = await seedItem(1, 0, 'cancelled')
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ nextStatus: 'in_progress' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    event.context.params = { id }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects without CSRF', async () => {
    const id = await seedItem(1, 0, 'pending')
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ nextStatus: 'in_progress' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    event.context.params = { id }
    await expect(handler(event)).rejects.toThrow(/CSRF/)
  })

  it('rejects waiter role with 403', async () => {
    const id = await seedItem(1, 0, 'pending')
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ nextStatus: 'in_progress' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    event.context.params = { id }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects bar role acting on kitchen item with 403', async () => {
    const id = await seedItem(1, 0, 'pending') // kitchen item
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ nextStatus: 'in_progress' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'bar', username: 'b' } }
    event.context.params = { id }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('admin can advance any station', async () => {
    const id = await seedItem(1, 1, 'pending') // bar item
    const { makeEvent } = await import('../setup/h3-event')
    const c = csrf()
    ctx.setBody({ nextStatus: 'in_progress' })
    const handler = (await import('../../server/api/production/items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    event.context.params = { id }
    const r = await handler(event) as { productionStatus: string }
    expect(r.productionStatus).toBe('in_progress')
  })
})
