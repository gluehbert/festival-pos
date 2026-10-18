import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let admin: { staffId: string; role: 'admin' }
const AVAIL = '../../server/api/menu/[id]/availability.patch'
const row = (id: string) => ctx.mem.public.one(`SELECT stock, is_available FROM menu_items WHERE id = '${id}'`) as { stock: number | null; is_available: boolean }

describe('Stock — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    admin = { staffId: seeded.staffId, role: 'admin' }
  })

  it('admin sets stock on create and edit; 0 is sold out, restocking brings it back', async () => {
    const created = await call<{ id: string; stock: number; isAvailable: boolean }>('../../server/api/admin/events/[id]/menu-items/index.post', {
      method: 'POST',
      staff: admin,
      params: { id: seeded.eventId },
      body: { nameDe: 'Kuchen', nameEn: 'Cake', priceCents: 250, stock: 0, category: 'Essen', station: 'kitchen' },
    })
    expect(created.body).toMatchObject({ stock: 0, isAvailable: false })
    const PATCH = '../../server/api/admin/menu-items/[id].patch'
    const restocked = await call<{ stock: number; isAvailable: boolean }>(PATCH, { method: 'PATCH', staff: admin, params: { id: created.body.id }, body: { stock: 12 } })
    expect(restocked.body).toMatchObject({ stock: 12, isAvailable: true })
    const untracked = await call<{ stock: null; isAvailable: boolean }>(PATCH, { method: 'PATCH', staff: admin, params: { id: created.body.id }, body: { stock: null } })
    expect(untracked.body).toMatchObject({ stock: null, isAvailable: true })
    expect((await call(PATCH, { method: 'PATCH', staff: admin, params: { id: created.body.id }, body: { stock: -1 } })).status).toBe(400)
  })

  it('kitchen and bar switch sold out for their own station only', async () => {
    const [fries, beer] = seeded.menuItemIds as [string, string]
    const kitchen = { staffId: insertStaff('kitchen'), role: 'kitchen' as const }
    const ok = await call<{ isAvailable: boolean }>(AVAIL, { method: 'PATCH', staff: kitchen, params: { id: fries }, body: { isAvailable: false } })
    expect(ok.status).toBe(200)
    expect(row(fries).is_available).toBe(false)
    expect((await call(AVAIL, { method: 'PATCH', staff: kitchen, params: { id: beer }, body: { isAvailable: false } })).status).toBe(403)
    expect((await call(AVAIL, { method: 'PATCH', staff: { staffId: insertStaff('waiter'), role: 'waiter' }, params: { id: fries }, body: { isAvailable: false } })).status).toBe(403)
    const audit = ctx.mem.public.many(`SELECT action, staff_id FROM audit_log`) as Array<{ staff_id: string }>
    expect(audit).toEqual([{ action: 'menu_availability', staff_id: kitchen.staffId }])
  })

  it('refuses "available" while the stock is 0', async () => {
    const fries = seeded.menuItemIds[0]!
    ctx.mem.public.none(`UPDATE menu_items SET stock = 0, is_available = false WHERE id = '${fries}'`)
    const res = await call(AVAIL, { method: 'PATCH', staff: admin, params: { id: fries }, body: { isAvailable: true } })
    expect(res.status).toBe(409)
  })

  it('lists the station articles including sold-out ones for kitchen/bar', async () => {
    const bar = { staffId: insertStaff('bar'), role: 'bar' as const }
    const menu = await call<{ items: Array<{ nameDe: string; isAvailable: boolean }> }>('../../server/api/production/menu.get', { staff: bar })
    expect(menu.body.items.map((i) => [i.nameDe, i.isAvailable])).toEqual([['Bier', true], ['Wasser', false]])
    expect((await call('../../server/api/production/menu.get', { staff: admin })).status).toBe(400)
    expect((await call('../../server/api/production/menu.get', { staff: { staffId: insertStaff('waiter'), role: 'waiter' } })).status).toBe(403)
  })
})
