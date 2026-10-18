import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const ORDERS = '../../server/api/orders/index.post'

describe('Helferverpflegung — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    // deposit and helper meals are off by default; these tests use them.
    ctx.mem.public.none('UPDATE events SET deposit_enabled = true, staff_meals_enabled = true')
  })

  it('needs a reason of at least 3 characters', async () => {
    const { CreateOrderSchema } = await import('../../server/lib/contracts/guest')
    const items = [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }]
    expect(() => CreateOrderSchema.parse({ tableNo: 0, mode: 'staff_meal', items })).toThrow()
    expect(() => CreateOrderSchema.parse({ tableNo: 0, mode: 'staff_meal', staffMealReason: ' a ', items })).toThrow()
    expect(CreateOrderSchema.parse({ tableNo: 0, mode: 'staff_meal', staffMealReason: ' Grillschicht ', items }).staffMealReason).toBe('Grillschicht')
  })

  it('is refused while switched off for the event', async () => {
    ctx.mem.public.none('UPDATE events SET staff_meals_enabled = false')
    const body = { tableNo: 0, mode: 'staff_meal', staffMealReason: 'Kapelle', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] }
    const res = await call(ORDERS, { method: 'POST', body, staff: { staffId: insertStaff('waiter'), role: 'waiter' } })
    expect(res.status).toBe(409)
    expect(ctx.mem.public.many('SELECT id FROM orders')).toHaveLength(0)
  })

  it('is for waiters and admins only', async () => {
    const body = { tableNo: 0, mode: 'staff_meal', staffMealReason: 'Kapelle', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] }
    expect((await call(ORDERS, { method: 'POST', body, guest: insertGuest(seeded.eventId, 1) })).status).toBe(401)
    expect((await call(ORDERS, { method: 'POST', body, staff: { staffId: insertStaff('kitchen'), role: 'kitchen' } })).status).toBe(403)
  })

  it('books at 0 €, settled at once, keeps the menu price as goods value and audits the reason', async () => {
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 200 WHERE id = '${seeded.menuItemIds[1]}'`)
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const res = await call<{ orderId: string; tableNo: number; tableBalanceCents: number; items: Array<{ unitPriceCents: number; depositCents: number; paymentStatus: string }> }>(ORDERS, {
      method: 'POST',
      staff: waiter,
      body: {
        tableNo: 7,
        mode: 'staff_meal',
        staffMealReason: 'Schicht Grillstand',
        items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 2 }, { menuItemId: seeded.menuItemIds[1]!, quantity: 1 }],
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.tableNo).toBe(0)
    expect(res.body.tableBalanceCents).toBe(0)
    expect(res.body.items.every((i) => i.unitPriceCents === 0 && i.depositCents === 0 && i.paymentStatus === 'paid')).toBe(true)

    const order = ctx.mem.public.one(`SELECT kind, table_no, staff_meal_reason FROM orders WHERE id = '${res.body.orderId}'`)
    expect(order).toEqual({ kind: 'staff_meal', table_no: 0, staff_meal_reason: 'Schicht Grillstand' })
    const prices = ctx.mem.public.many(`SELECT list_price_cents FROM order_items ORDER BY list_price_cents`) as Array<{ list_price_cents: number }>
    expect(prices.map((p) => p.list_price_cents)).toEqual([350, 400])

    const audit = ctx.mem.public.one(`SELECT action, staff_id, reason, payload FROM audit_log`) as { action: string; staff_id: string; reason: string; payload: { valueCents: number } }
    expect(audit).toMatchObject({ action: 'staff_meal', staff_id: waiter.staffId, reason: 'Schicht Grillstand' })
    expect(audit.payload.valueCents).toBe(1100)
  })

  it('refuses a staff meal without reason at the database', () => {
    expect(() => ctx.mem.public.none(
      `INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${seeded.eventId}', 0, 'staff_meal', '${seeded.staffId}')`,
    )).toThrow()
  })
})
