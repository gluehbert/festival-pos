import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx

describe('GET /api/menu', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
  })

  it('returns only available items, sorted, with cache header (FR-033, NFR-002)', async () => {
    const { seedEvent } = await import('../setup/pg-mem-db')
    seedEvent(ctx.mem, {
      tableRangeFrom: 1,
      tableRangeTo: 20,
      items: [
        { nameDe: 'B', nameEn: 'B', priceCents: 200, category: 'food', station: 'kitchen', sortOrder: 2 },
        { nameDe: 'A', nameEn: 'A', priceCents: 100, category: 'food', station: 'kitchen', sortOrder: 1 },
        { nameDe: 'Hidden', nameEn: 'Hidden', priceCents: 100, category: 'food', station: 'kitchen', isAvailable: false, sortOrder: 0 },
      ],
    })

    const { makeEvent } = await import('../setup/h3-event')
    const { MenuSchema } = await import('../../server/lib/contracts/guest')
    const handler = (await import('../../server/api/menu/index.get')).default
    const { event, getHeader } = makeEvent({ method: 'GET' })
    const result = await handler(event)
    const parsed = MenuSchema.parse(result)
    expect(parsed.items.length).toBe(2)
    expect(parsed.items.map((i) => i.nameDe)).toEqual(['A', 'B'])
    expect(parsed.items.every((i) => i.isAvailable)).toBe(true)
    expect(String(getHeader('Cache-Control'))).toMatch(/s-maxage=5/)
  })

  it('throws 404 when no active event', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/menu/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    await expect(handler(event)).rejects.toThrow(/No active event/)
  })

  it('MenuSchema rejects malformed items', async () => {
    const { MenuSchema } = await import('../../server/lib/contracts/guest')
    expect(() => MenuSchema.parse({ eventId: 'not-uuid', items: [] })).toThrow()
  })
})
