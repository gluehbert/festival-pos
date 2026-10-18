import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let eventId: string
// The seeded admin: audit rows reference a real staff member.
let adminId: string

// `path` is relative to /api/admin/events/{id}/menu-items.
function adminEvent(path: string, role: 'admin' | 'waiter' = 'admin', id = eventId) {
  const url = `/api/admin/events/${id}/menu-items${path}`
  const e = makeEvent({ method: 'POST', url, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  e.event.context.auth = { staff: { staffId: adminId, role, username: 'a' } }
  e.event.context.params = { id }
  return e
}

function upload(csv: string) {
  ctx.setBody([{ name: 'file', filename: 'karte.csv', data: Buffer.from(csv, 'utf8') }])
}

const CSV = [
  'Name (DE);Name (EN);Price (€);Category;Station;Sort order;Available',
  'Pommes;Fries;3,80;Snacks;Kitchen;5;yes',
  'Radler;Shandy;4,20;Bier;Bar;50;yes',
].join('\n')

describe('menu import/export', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    const seeded = seedEvent(ctx.mem)
    eventId = seeded.eventId
    adminId = seeded.staffId // Pommes 3,50 (kitchen), Bier, Wasser
  })

  it('previews without writing, then applies: updates by name, creates new items', async () => {
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/import.post')).default
    upload(CSV)
    const preview = await handler(adminEvent('/import?dryRun=1').event)
    expect(preview).toMatchObject({ applied: false, created: 1, updated: 1, unchanged: 0, errors: [] })
    expect(ctx.mem.public.one(`SELECT price_cents FROM menu_items WHERE name_de='Pommes'`)).toEqual({ price_cents: 350 })

    upload(CSV)
    const applied = await handler(adminEvent('/import').event)
    expect(applied).toMatchObject({ applied: true, created: 1, updated: 1 })
    expect(ctx.mem.public.one(`SELECT price_cents, sort_order FROM menu_items WHERE name_de='Pommes'`)).toEqual({ price_cents: 380, sort_order: 5 })
    expect(ctx.mem.public.one(`SELECT station, price_cents FROM menu_items WHERE name_de='Radler'`)).toEqual({ station: 'bar', price_cents: 420 })
    expect(ctx.mem.public.many(`SELECT name_de FROM menu_items WHERE name_de='Wasser'`)).toHaveLength(1)

    upload(CSV)
    expect(await handler(adminEvent('/import').event)).toMatchObject({ unchanged: 2, created: 0, updated: 0 })
  })

  it('keeps an item sold out by its stock unavailable, and imports the deposit column', async () => {
    ctx.mem.public.none(`UPDATE menu_items SET stock = 0, is_available = false WHERE name_de = 'Pommes'`)
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/import.post')).default
    upload(['Name (DE);Price (€);Deposit (€);Category;Station;Available', 'Pommes;3,50;;food;Kitchen;yes', 'Bier;4,00;2,00;drink;Bar;yes'].join('\n'))
    await handler(adminEvent('/import').event)
    expect(ctx.mem.public.one(`SELECT is_available, deposit_cents FROM menu_items WHERE name_de='Pommes'`)).toEqual({ is_available: false, deposit_cents: 0 })
    expect(ctx.mem.public.one(`SELECT is_available, deposit_cents FROM menu_items WHERE name_de='Bier'`)).toEqual({ is_available: true, deposit_cents: 200 })
  })

  it('writes nothing when any row is invalid', async () => {
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/import.post')).default
    upload(`${CSV}\nCola;;teuer;Softdrinks;Bar;;`)
    const result = await handler(adminEvent('/import').event)
    expect(result).toMatchObject({ applied: false, errors: [{ row: 4 }] })
    expect(ctx.mem.public.many(`SELECT * FROM menu_items WHERE name_de='Radler'`)).toHaveLength(0)
  })

  it('requires an admin, a file and an existing event', async () => {
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/import.post')).default
    upload(CSV)
    await expect(handler(adminEvent('/import', 'waiter').event)).rejects.toMatchObject({ statusCode: 403 })
    ctx.setBody([])
    await expect(handler(adminEvent('/import').event)).rejects.toMatchObject({ statusCode: 400 })
    upload(CSV)
    await expect(handler(adminEvent('/import', 'admin', '00000000-0000-4000-8000-0000000000ff').event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('imports into an event that is not active', async () => {
    ctx.mem.public.none(`UPDATE events SET is_active = false`)
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/import.post')).default
    upload(CSV)
    expect(await handler(adminEvent('/import').event)).toMatchObject({ applied: true, created: 1, updated: 1 })
  })

  it('downloads the current menu as .xlsx', async () => {
    const handler = (await import('../../server/api/admin/events/[id]/menu-items/template.get')).default
    const e = adminEvent('/template')
    const buffer = await handler(e.event) as Buffer
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    expect(String(e.getHeader('content-type'))).toContain('spreadsheetml')
    const { readMenuFile } = await import('../../server/lib/menu-excel')
    const { items } = await readMenuFile(buffer)
    expect(items.map((i) => i.nameDe).sort()).toEqual(['Bier', 'Pommes', 'Wasser'])
  })
})
