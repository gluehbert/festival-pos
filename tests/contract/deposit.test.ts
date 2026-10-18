import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let admin: { staffId: string; role: 'admin' }

describe('deposit — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    // deposit and helper meals are off by default; these tests use them.
    ctx.mem.public.none('UPDATE events SET deposit_enabled = true, staff_meals_enabled = true')
    admin = { staffId: seeded.staffId, role: 'admin' }
  })

  it('admin sets the deposit on create and edit; guests see it on the menu', async () => {
    const created = await call<{ id: string; depositCents: number }>('../../server/api/admin/events/[id]/menu-items/index.post', {
      method: 'POST',
      staff: admin,
      params: { id: seeded.eventId },
      body: { nameDe: 'Radler', nameEn: 'Shandy', priceCents: 350, depositCents: 200, category: 'Getränke', station: 'bar' },
    })
    expect(created.status).toBe(201)
    expect(created.body.depositCents).toBe(200)

    const bad = await call('../../server/api/admin/menu-items/[id].patch', { method: 'PATCH', staff: admin, params: { id: created.body.id }, body: { depositCents: -1 } })
    expect(bad.status).toBe(400)
    const patched = await call<{ depositCents: number }>('../../server/api/admin/menu-items/[id].patch', {
      method: 'PATCH', staff: admin, params: { id: created.body.id }, body: { depositCents: 300 },
    })
    expect(patched.body.depositCents).toBe(300)

    const menu = await call<{ items: Array<{ nameDe: string; depositCents: number }> }>('../../server/api/menu/index.get')
    expect(menu.body.items.find((i) => i.nameDe === 'Radler')!.depositCents).toBe(300)
    expect(menu.body.items.find((i) => i.nameDe === 'Pommes')!.depositCents).toBe(0)
  })

  it('charges the deposit with the order, priced on the server', async () => {
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 200 WHERE id = '${seeded.menuItemIds[1]}'`)
    const guest = insertGuest(seeded.eventId, 2)
    const order = await call<{ tableBalanceCents: number; items: Array<{ depositCents: number; unitPriceCents: number }> }>(
      '../../server/api/orders/index.post',
      { method: 'POST', guest, body: { tableNo: 2, items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 2, depositCents: 0 }] } },
    )
    expect(order.status).toBe(201)
    expect(order.body.items[0]).toMatchObject({ unitPriceCents: 400, depositCents: 200 })
    expect(order.body.tableBalanceCents).toBe(1200)
    const session = await call<{ tableBalanceCents: number }>('../../server/api/orders/session.get', { guest })
    expect(session.body.tableBalanceCents).toBe(1200)
  })

  it('books deposit returns for waiters only, at deposit values on the menu', async () => {
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 200 WHERE id = '${seeded.menuItemIds[1]}'`)
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 500, is_available = false WHERE id = '${seeded.menuItemIds[2]}'`)
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    const opts = await call<{ units: number[] }>('../../server/api/deposit-returns/options.get', { staff: waiter })
    expect(opts.body.units).toEqual([200, 500])

    const path = '../../server/api/deposit-returns/index.post'
    expect((await call(path, { method: 'POST', staff: { staffId: insertStaff('bar'), role: 'bar' }, body: { unitCents: 200, quantity: 1 } })).status).toBe(403)
    expect((await call(path, { method: 'POST', staff: waiter, body: { unitCents: 250, quantity: 1 } })).status).toBe(400)
    expect((await call(path, { method: 'POST', staff: waiter, body: { unitCents: 200, quantity: 0 } })).status).toBe(400)

    const ok = await call<{ amountCents: number; quantity: number }>(path, { method: 'POST', staff: waiter, body: { unitCents: 200, quantity: 3 } })
    expect(ok.status).toBe(201)
    expect(ok.body).toMatchObject({ amountCents: -600, quantity: 3 })
    const audit = ctx.mem.public.many(`SELECT action, staff_id FROM audit_log`) as Array<{ action: string; staff_id: string }>
    expect(audit).toEqual([{ action: 'deposit_return', staff_id: waiter.staffId }])
  })

  it('switched off for the event: nothing charged, shown or paid back', async () => {
    ctx.mem.public.none('UPDATE events SET deposit_enabled = false')
    ctx.mem.public.none(`UPDATE menu_items SET deposit_cents = 200 WHERE id = '${seeded.menuItemIds[1]}'`)
    const menu = await call<{ items: Array<{ id: string; depositCents: number }> }>('../../server/api/menu/index.get')
    expect(menu.body.items.every((i) => i.depositCents === 0)).toBe(true)

    const guest = insertGuest(seeded.eventId, 2)
    const order = await call<{ tableBalanceCents: number; items: Array<{ depositCents: number }> }>('../../server/api/orders/index.post', {
      method: 'POST', guest, body: { tableNo: 2, items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 2 }] },
    })
    expect(order.body.items[0]!.depositCents).toBe(0)
    expect(order.body.tableBalanceCents).toBe(800)

    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    expect((await call<{ units: number[] }>('../../server/api/deposit-returns/options.get', { staff: waiter })).body.units).toEqual([])
    const back = await call('../../server/api/deposit-returns/index.post', { method: 'POST', staff: waiter, body: { unitCents: 200, quantity: 1 } })
    expect(back.status).toBe(409)
  })
})
