import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const ORDERS = '../../server/api/orders/index.post'

describe('order notes — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('trims notes, turns blanks into null and rejects more than 80 characters', async () => {
    const { CreateOrderSchema } = await import('../../server/lib/contracts/guest')
    const id = seeded.menuItemIds[0]!
    const parsed = CreateOrderSchema.parse({
      tableNo: 1,
      items: [
        { menuItemId: id, quantity: 1, note: '  ohne Zwiebeln ' },
        { menuItemId: id, quantity: 1, note: '   ' },
        { menuItemId: id, quantity: 1 },
      ],
    })
    expect(parsed.items.map((i) => i.note)).toEqual(['ohne Zwiebeln', null, null])
    expect(() => CreateOrderSchema.parse({ tableNo: 1, items: [{ menuItemId: id, quantity: 1, note: 'x'.repeat(81) }] })).toThrow()
  })

  it('stores the note per position and keeps positions with different notes apart', async () => {
    const guest = insertGuest(seeded.eventId, 3)
    const fries = seeded.menuItemIds[0]!
    const res = await call<{ items: Array<{ menuItemId: string; quantity: number; note: string | null }> }>(ORDERS, {
      method: 'POST',
      guest,
      body: {
        tableNo: 3,
        items: [
          { menuItemId: fries, quantity: 1, note: 'ohne Salz' },
          { menuItemId: fries, quantity: 2 },
          { menuItemId: fries, quantity: 1, note: 'Ketchup' },
        ],
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.items.map((i) => [i.quantity, i.note]).sort()).toEqual([[1, 'Ketchup'], [1, 'ohne Salz'], [2, null]])

    const session = await call<{ items: Array<{ note: string | null }> }>('../../server/api/orders/session.get', { guest })
    expect(session.body.items.map((i) => i.note ?? '-').sort()).toEqual(['-', 'Ketchup', 'ohne Salz'])
  })

  it('shows notes to kitchen/bar and on the waiter ticket', async () => {
    const waiter = { staffId: seeded.staffId, role: 'waiter' as const }
    await call(ORDERS, {
      method: 'POST',
      staff: waiter,
      body: { tableNo: 5, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1, note: 'extra scharf' }] },
    })
    const queue = await call<{ items: Array<{ note: string | null }> }>('../../server/api/production/queue.get', {
      staff: { staffId: seeded.staffId, role: 'kitchen' },
    })
    expect(queue.body.items.map((i) => i.note)).toEqual(['extra scharf'])

    const ticket = await call<{ items: Array<{ note: string | null }> }>('../../server/api/tickets/[id].get', {
      staff: waiter,
      params: { id: 't-5' },
    })
    expect(ticket.body.items[0]!.note).toBe('extra scharf')
  })

  it('refuses an over-long note at the database too', () => {
    const order = ctx.mem.public.one(
      `INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${seeded.eventId}', 1, 'walkin', '${seeded.staffId}') RETURNING id`,
    ) as { id: string }
    expect(() => ctx.mem.public.none(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, note)
       VALUES ('${order.id}', '${seeded.menuItemIds[0]}', 1, 350, 'kitchen', '${'x'.repeat(81)}')`,
    )).toThrow()
  })
})
