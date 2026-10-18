import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx

describe('POST /api/session', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('CreateGuestSessionSchema validates input shape', async () => {
    const { CreateGuestSessionSchema } = await import('../../server/lib/contracts/guest')
    expect(() => CreateGuestSessionSchema.parse({ tableNo: 0, pin: 'X' })).toThrow()
    expect(() => CreateGuestSessionSchema.parse({ tableNo: 1.5, pin: 'X' })).toThrow()
    expect(() => CreateGuestSessionSchema.parse({ tableNo: 3 })).toThrow(/key or pin/)
    expect(CreateGuestSessionSchema.parse({ tableNo: 3, pin: 'demo1' })).toMatchObject({ tableNo: 3, pin: 'DEMO1' })
  })

  it('creates a guest session, sets pos_guest cookie, returns valid response shape', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { GuestSessionSchema } = await import('../../server/lib/contracts/guest')
    ctx.setBody({ tableNo: 5, pin: 'DEMO1' })
    const handler = (await import('../../server/api/session.post')).default
    const { event, getSetCookies } = makeEvent({ method: 'POST' })
    const result = await handler(event)
    const parsed = GuestSessionSchema.parse(result)
    expect(parsed.tableNo).toBe(5)
    expect(parsed.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Date(parsed.expiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(getSetCookies().some((c) => c.startsWith('pos_guest='))).toBe(true)
  })

  it('rejects table number outside event range', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ tableNo: 99, pin: 'DEMO1' })
    const handler = (await import('../../server/api/session.post')).default
    const { event } = makeEvent({ method: 'POST' })
    await expect(handler(event)).rejects.toThrow(/99|range/)
  })

  it('returns 404 when no active event exists', async () => {
    const blank = await makeCtx()
    setCtx(blank)
    const { makeEvent } = await import('../setup/h3-event')
    blank.setBody({ tableNo: 1, pin: 'DEMO1' })
    const handler = (await import('../../server/api/session.post')).default
    const { event } = makeEvent({ method: 'POST' })
    await expect(handler(event)).rejects.toThrow(/active event|404/i)
  })

  it('accepts the QR table key, rejects keys for other tables and wrong PINs', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { tableKey } = await import('../../server/lib/table-key')
    const handler = (await import('../../server/api/session.post')).default
    const eventId = (ctx.mem.public.one(`SELECT id FROM events WHERE is_active`) as { id: string }).id

    ctx.setBody({ tableNo: 4, key: tableKey(eventId, 4) })
    await expect(handler(makeEvent({ method: 'POST' }).event)).resolves.toMatchObject({ tableNo: 4 })

    ctx.setBody({ tableNo: 5, key: tableKey(eventId, 4) })
    await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 403 })

    ctx.setBody({ tableNo: 5, pin: 'WRONG' })
    await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throttles wrong codes per IP', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/session.post')).default
    for (let i = 0; i < 20; i++) {
      ctx.setBody({ tableNo: 2, pin: `NOPE${i}` })
      await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 403 })
    }
    ctx.setBody({ tableNo: 2, pin: 'DEMO1' })
    await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 429 })
  })
})
