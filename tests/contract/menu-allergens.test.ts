import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

function adminEvent(method: string, params: Record<string, string>, url?: string) {
  const e = makeEvent({ method, url, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  e.event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin' as const, username: 'admin' } }
  e.event.context.params = params
  return e
}

async function guestMenu() {
  const handler = (await import('../../server/api/menu/index.get')).default
  const { MenuSchema } = await import('../../server/lib/contracts/guest')
  return MenuSchema.parse(await handler(makeEvent({ method: 'GET' }).event)).items
}

describe('menu item allergens', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem) // Pommes, Bier, Wasser (unavailable)
  })

  it('new and existing items start as "not recorded" for guests', async () => {
    const items = await guestMenu()
    expect(items.map((i) => [i.nameDe, i.allergens, i.diet])).toEqual([['Pommes', null, null], ['Bier', null, null]])
  })

  it('creates with allergens (sorted, deduplicated) and a diet tag', async () => {
    const post = (await import('../../server/api/admin/events/[id]/menu-items/index.post')).default
    ctx.setBody({
      nameDe: 'Burger', nameEn: 'Burger', priceCents: 850, category: 'food', station: 'kitchen',
      allergens: ['mustard', 'gluten', 'milk', 'gluten'], diet: 'vegetarian',
    })
    const r = await post(adminEvent('POST', { id: seeded.eventId }).event)
    expect(r).toMatchObject({ allergens: ['gluten', 'milk', 'mustard'], diet: 'vegetarian' })
    expect((await guestMenu()).find((i) => i.nameDe === 'Burger')).toMatchObject({ allergens: ['gluten', 'milk', 'mustard'], diet: 'vegetarian' })
  })

  it('PATCH sets "none", clears back to "not recorded" and rejects unknown values', async () => {
    const patch = (await import('../../server/api/admin/menu-items/[id].patch')).default
    const id = seeded.menuItemIds[0]!

    ctx.setBody({ allergens: [], diet: 'vegan' })
    expect(await patch(adminEvent('PATCH', { id }).event)).toMatchObject({ allergens: [], diet: 'vegan' })
    expect((await guestMenu())[0]).toMatchObject({ allergens: [], diet: 'vegan' })

    ctx.setBody({ priceCents: 400 })
    expect(await patch(adminEvent('PATCH', { id }).event)).toMatchObject({ allergens: [], diet: 'vegan' })

    ctx.setBody({ allergens: null, diet: null })
    expect(await patch(adminEvent('PATCH', { id }).event)).toMatchObject({ allergens: null, diet: null })

    for (const body of [{ allergens: ['cinnamon'] }, { diet: 'pescetarian' }, { allergens: 'gluten' }]) {
      ctx.setBody(body)
      await expect(patch(adminEvent('PATCH', { id }).event)).rejects.toMatchObject({ statusCode: 400 })
    }
  })

  it('the Excel import sets allergens and the template exports them as codes', async () => {
    const importHandler = (await import('../../server/api/admin/events/[id]/menu-items/import.post')).default
    const csv = [
      'Name (DE);Price (€);Category;Station;Allergens;Vegetarian/Vegan',
      'Pommes;3,50;food;Kitchen;none;vegan',
      'Bier;4;drink;Bar;A;',
    ].join('\n')
    ctx.setBody([{ name: 'file', filename: 'karte.csv', data: Buffer.from(csv, 'utf8') }])
    const url = `/api/admin/events/${seeded.eventId}/menu-items/import`
    expect(await importHandler(adminEvent('POST', { id: seeded.eventId }, url).event)).toMatchObject({ applied: true, updated: 2 })
    expect(await guestMenu()).toMatchObject([
      { nameDe: 'Pommes', allergens: [], diet: 'vegan' },
      { nameDe: 'Bier', allergens: ['gluten'], diet: null },
    ])

    // Re-importing the same file changes nothing.
    ctx.setBody([{ name: 'file', filename: 'karte.csv', data: Buffer.from(csv, 'utf8') }])
    expect(await importHandler(adminEvent('POST', { id: seeded.eventId }, `${url}?dryRun=1`).event)).toMatchObject({ unchanged: 2 })

    const template = (await import('../../server/api/admin/events/[id]/menu-items/template.get')).default
    const { readMenuFile } = await import('../../server/lib/menu-excel')
    const { items } = await readMenuFile(await template(adminEvent('GET', { id: seeded.eventId }).event) as Buffer)
    expect(items.map((i) => [i.nameDe, i.allergens, i.diet])).toEqual([
      ['Pommes', [], 'vegan'], ['Bier', ['gluten'], null], ['Wasser', null, null],
    ])
  })

  it('GET /api/admin/events/{id}/allergens returns the printable notice; admins only', async () => {
    const handler = (await import('../../server/api/admin/events/[id]/allergens.get')).default
    const { event, getHeader } = adminEvent('GET', { id: seeded.eventId })
    const bytes = await handler(event) as Buffer
    expect(getHeader('content-type')).toBe('application/pdf')
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-')

    const waiter = adminEvent('GET', { id: seeded.eventId })
    waiter.event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    await expect(handler(waiter.event)).rejects.toMatchObject({ statusCode: 403 })
  })
})
