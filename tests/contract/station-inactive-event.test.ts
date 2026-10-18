import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

// The seeded event ends and another one becomes active.
function switchActiveEvent(): void {
  ctx.mem.public.none(`UPDATE events SET is_active = false WHERE id = '${seeded.eventId}'`)
  ctx.mem.public.none(
    `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
     VALUES ('Next', 'NEXT1234', 1, 10, true)`,
  )
}

describe('kitchen and bar only work on the active event', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('production item of an inactive event answers 404', async () => {
    const guestId = (ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 3, now() + interval '7 days') RETURNING id`,
    ) as { id: string }).id
    const orderId = (ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', 3, '${guestId}') RETURNING id`,
    ) as { id: string }).id
    const menuId = seeded.menuItemIds[0]!
    const m = ctx.mem.public.one(`SELECT price_cents, station FROM menu_items WHERE id='${menuId}'`) as { price_cents: number; station: string }
    const itemId = (ctx.mem.public.one(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
       VALUES ('${orderId}', '${menuId}', 1, ${m.price_cents}, '${m.station}') RETURNING id`,
    ) as { id: string }).id
    switchActiveEvent()
    const r = await call('../../server/api/production/items/[id].patch', {
      method: 'PATCH',
      staff: { staffId: seeded.staffId, role: 'admin' },
      params: { id: itemId },
      body: { nextStatus: 'in_progress' },
    })
    expect(r.status).toBe(404)
    expect((ctx.mem.public.one(`SELECT production_status FROM order_items WHERE id='${itemId}'`) as { production_status: string }).production_status).toBe('pending')
  })

  it('availability of an article of an inactive event answers 404', async () => {
    switchActiveEvent()
    const r = await call('../../server/api/menu/[id]/availability.patch', {
      method: 'PATCH',
      staff: { staffId: seeded.staffId, role: 'admin' },
      params: { id: seeded.menuItemIds[0]! },
      body: { isAvailable: false },
    })
    expect(r.status).toBe(404)
    expect((ctx.mem.public.one(`SELECT is_available FROM menu_items WHERE id='${seeded.menuItemIds[0]}'`) as { is_available: boolean }).is_available).toBe(true)
  })
})
