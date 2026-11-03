import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let seeded: { eventId: string; staffId: string }

function req(method: 'GET' | 'PUT', body?: unknown, role: 'admin' | 'kitchen' = 'admin') {
  if (body !== undefined) ctx.setBody(body)
  const { event } = makeEvent({ method, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'a' } }
  event.context.params = { id: seeded.eventId }
  return event
}

describe('buzzers per station (admin)', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('stores each station\'s list in lane order; the stations may share a key', async () => {
    const get = (await import('../../server/api/admin/events/[id]/buzzers.get')).default
    const put = (await import('../../server/api/admin/events/[id]/buzzers.put')).default
    expect(await get(req('GET'))).toEqual({ kitchen: [], bar: [], cafe: [] })

    expect(await put(req('PUT', { station: 'kitchen', keys: ['F9', 'F10', ' '] }))).toEqual({ kitchen: ['F9', 'F10', ' '], bar: [], cafe: [] })
    expect(await put(req('PUT', { station: 'bar', keys: ['F9'] }))).toEqual({ kitchen: ['F9', 'F10', ' '], bar: ['F9'], cafe: [] })
    // Removing the first one moves the others up a lane.
    await put(req('PUT', { station: 'kitchen', keys: ['F10', ' '] }))
    expect(ctx.mem.public.many(`SELECT lane, key FROM station_buzzers WHERE station = 'kitchen' ORDER BY lane`))
      .toEqual([{ lane: 1, key: 'F10' }, { lane: 2, key: ' ' }])
    expect(await get(req('GET'))).toEqual({ kitchen: ['F10', ' '], bar: ['F9'], cafe: [] })

    const audit = ctx.mem.public.many(`SELECT payload FROM audit_log WHERE action = 'event_update'`) as Array<{ payload: unknown }>
    expect(audit.at(-1)!.payload).toEqual({ fields: ['buzzers'], station: 'kitchen', buzzers: ['F10', ' '] })
  })

  it('refuses a key twice at a station, more than four buzzers, bad keys and non-admins', async () => {
    const put = (await import('../../server/api/admin/events/[id]/buzzers.put')).default
    for (const body of [
      { station: 'kitchen', keys: ['F9', 'F9'] },
      { station: 'kitchen', keys: ['1', '2', '3', '4', '5'] },
      { station: 'kitchen', keys: [''] },
      { station: 'kitchen', keys: ['x'.repeat(33)] },
      { station: 'grill', keys: ['F9'] },
    ]) {
      await expect(put(req('PUT', body))).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(put(req('PUT', { station: 'kitchen', keys: ['F9'] }, 'kitchen'))).rejects.toMatchObject({ statusCode: 403 })
    expect(ctx.mem.public.many('SELECT * FROM station_buzzers')).toEqual([])
  })
})
