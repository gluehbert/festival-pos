import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

function adminAuth(staffId: string) {
  return { staff: { staffId, role: 'admin' as const, username: 'admin' } }
}

describe('Admin menu items contracts', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('GET /api/admin/events/{id}/menu-items returns full list incl. unavailable', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { AdminMenuListSchema } = await import('../../server/lib/contracts/admin')
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = adminAuth(seeded.staffId)
    event.context.params = { id: seeded.eventId }
    const r = await handler(event)
    const parsed = AdminMenuListSchema.parse(r)
    expect(parsed.items.length).toBe(3)
    expect(parsed.items.some((i) => !i.isAvailable)).toBe(true)
  })

  it('POST /api/admin/events/{id}/menu-items creates item', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { AdminMenuItemSchema } = await import('../../server/lib/contracts/admin')
    const c = csrf()
    ctx.setBody({
      nameDe: 'Cola',
      nameEn: 'Coke',
      priceCents: 300,
      category: 'drink',
      station: 'bar',
      sortOrder: 5,
    })
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = adminAuth(seeded.staffId)
    event.context.params = { id: seeded.eventId }
    const r = await handler(event)
    const parsed = AdminMenuItemSchema.parse(r)
    expect(parsed.nameDe).toBe('Cola')
    expect(parsed.priceCents).toBe(300)
  })

  it('a price list can be prepared for an event that is not active', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { AdminMenuListSchema } = await import('../../server/lib/contracts/admin')
    const draftId = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
       VALUES ('Weihnachtsmarkt', 'XMAS1', 1, 10, false) RETURNING id`,
    ) as { id: string }).id
    const c = csrf()
    ctx.setBody({ nameDe: 'Glühwein', nameEn: 'Mulled wine', priceCents: 450, category: 'drink', station: 'bar' })
    const post = (await import('../../server/api/admin/events/[id]/menu-items/index.post')).default
    const created = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers }).event
    created.context.auth = adminAuth(seeded.staffId)
    created.context.params = { id: draftId }
    expect(await post(created)).toMatchObject({ eventId: draftId, nameDe: 'Glühwein' })

    const get = (await import('../../server/api/admin/events/[id]/menu-items/index.get')).default
    const list = async (id: string) => {
      const { event } = makeEvent({ method: 'GET' })
      event.context.auth = adminAuth(seeded.staffId)
      event.context.params = { id }
      return AdminMenuListSchema.parse(await get(event)).items.map((i) => i.nameDe)
    }
    expect(await list(draftId)).toEqual(['Glühwein'])
    expect(await list(seeded.eventId)).not.toContain('Glühwein')
  })

  it('GET for an unknown event is 404, a malformed id 400', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/index.get')).default
    for (const [id, status] of [['00000000-0000-4000-8000-0000000000ff', 404], ['nope', 400]] as const) {
      const { event } = makeEvent({ method: 'GET' })
      event.context.auth = adminAuth(seeded.staffId)
      event.context.params = { id }
      await expect(handler(event)).rejects.toMatchObject({ statusCode: status })
    }
  })

  it('PATCH /api/admin/menu-items/{id} partial update', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { AdminMenuItemSchema } = await import('../../server/lib/contracts/admin')
    const c = csrf()
    ctx.setBody({ priceCents: 999 })
    const handler = (await import('../../server/api/admin/menu-items/[id].patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = adminAuth(seeded.staffId)
    event.context.params = { id: seeded.menuItemIds[0]! }
    const r = await handler(event)
    const parsed = AdminMenuItemSchema.parse(r)
    expect(parsed.priceCents).toBe(999)
  })

  it('PATCH /api/menu/{id}/availability toggles + audits (FR-033)', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { AdminMenuItemSchema, AvailabilityPatchSchema } = await import('../../server/lib/contracts/admin')
    expect(() => AvailabilityPatchSchema.parse({ isAvailable: false })).not.toThrow()
    expect(() => AvailabilityPatchSchema.parse({})).toThrow()

    const c = csrf()
    ctx.setBody({ isAvailable: false })
    const handler = (await import('../../server/api/menu/[id]/availability.patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = adminAuth(seeded.staffId)
    event.context.params = { id: seeded.menuItemIds[0]! }
    const r = await handler(event)
    const parsed = AdminMenuItemSchema.parse(r)
    expect(parsed.isAvailable).toBe(false)

    const audit = ctx.mem.public.many(`SELECT action FROM audit_log WHERE action='menu_availability'`)
    expect(audit.length).toBe(1)
  })

  it('non-admin gets 403', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })
})
