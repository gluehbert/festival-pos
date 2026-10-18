import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

describe('US4 — availability toggle propagates to GET /api/menu (FR-033)', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('PATCH availability=false hides item from guest menu', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const id = seeded.menuItemIds[0]!

    const menuHandler = (await import('../../server/api/menu/index.get')).default
    const before = (await menuHandler(makeEvent({ method: 'GET' }).event)) as { items: Array<{ id: string }> }
    expect(before.items.some((i) => i.id === id)).toBe(true)

    const c = csrf()
    ctx.setBody({ isAvailable: false })
    const patchHandler = (await import('../../server/api/menu/[id]/availability.patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    event.context.params = { id }
    await patchHandler(event)

    const after = (await menuHandler(makeEvent({ method: 'GET' }).event)) as { items: Array<{ id: string }> }
    expect(after.items.some((i) => i.id === id)).toBe(false)
  })

  it('re-enabling availability brings the item back', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const id = seeded.menuItemIds[2]! // seeded as isAvailable=false

    const menuHandler = (await import('../../server/api/menu/index.get')).default
    const before = (await menuHandler(makeEvent({ method: 'GET' }).event)) as { items: Array<{ id: string }> }
    expect(before.items.some((i) => i.id === id)).toBe(false)

    const c = csrf()
    ctx.setBody({ isAvailable: true })
    const patchHandler = (await import('../../server/api/menu/[id]/availability.patch')).default
    const { event } = makeEvent({ method: 'PATCH', cookies: c.cookies, headers: c.headers })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    event.context.params = { id }
    await patchHandler(event)

    const after = (await menuHandler(makeEvent({ method: 'GET' }).event)) as { items: Array<{ id: string }> }
    expect(after.items.some((i) => i.id === id)).toBe(true)
  })
})
