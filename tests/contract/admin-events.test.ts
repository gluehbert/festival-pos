import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let adminId: string

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

function adminAuth(staffId: string) {
  return { staff: { staffId, role: 'admin' as const, username: 'admin' } }
}

describe('Admin events contracts', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    adminId = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('admin', 'h', 'admin') RETURNING id`,
    ) as { id: string }).id
  })

  it('schemas validate canonical shapes', async () => {
    const c = await import('../../server/lib/contracts/admin')
    expect(() => c.CreateEventSchema.parse({
      name: 'Test',
      pinCode: 'ABC123',
      tableRangeFrom: 1,
      tableRangeTo: 24,
    })).not.toThrow()
    expect(() => c.CreateEventSchema.parse({
      name: 'Bad',
      pinCode: 'lowercase',
      tableRangeFrom: 1,
      tableRangeTo: 10,
    })).toThrow()
    expect(() => c.CreateEventSchema.parse({
      name: 'Bad',
      pinCode: 'OK12',
      tableRangeFrom: 10,
      tableRangeTo: 1,
    })).toThrow()
  })

  it('GET /api/admin/events returns list (EventsListSchema)', async () => {
    ctx.mem.public.none(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
       VALUES ('Demo', 'DEMO1', 1, 24, true)`,
    )
    const { makeEvent } = await import('../setup/h3-event')
    const { EventsListSchema } = await import('../../server/lib/contracts/admin')
    const handler = (await import('../../server/api/admin/events/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = adminAuth(adminId)
    const r = await handler(event)
    const parsed = EventsListSchema.parse(r)
    expect(parsed.events.length).toBe(1)
    expect(parsed.events[0]!.isActive).toBe(true)
  })

  it('GET requires admin role', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/index.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.auth = { staff: { staffId: adminId, role: 'waiter', username: 'w' } }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('POST /api/admin/events creates event (is_active=false initially)', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { EventSchema } = await import('../../server/lib/contracts/admin')
    const c = csrf()
    ctx.setBody({
      name: 'Sommerfest',
      pinCode: 'SF2025',
      tableRangeFrom: 1,
      tableRangeTo: 30,
    })
    const handler = (await import('../../server/api/admin/events/index.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = adminAuth(adminId)
    const r = await handler(event)
    const parsed = EventSchema.parse(r)
    expect(parsed.isActive).toBe(false)
    expect(parsed.name).toBe('Sommerfest')
  })

  it('POST requires CSRF', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ name: 'X', pinCode: 'XX12', tableRangeFrom: 1, tableRangeTo: 5 })
    const handler = (await import('../../server/api/admin/events/index.post')).default
    const { event } = makeEvent({ method: 'POST' })
    event.context.auth = adminAuth(adminId)
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('POST /api/admin/events/{id}/activate swaps active flag (FR-030)', async () => {
    const aId = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
       VALUES ('A', 'EVA01', 1, 10, true) RETURNING id`,
    ) as { id: string }).id
    const bId = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
       VALUES ('B', 'EVB01', 1, 10, false) RETURNING id`,
    ) as { id: string }).id

    const { makeEvent } = await import('../setup/h3-event')
    const { EventSchema } = await import('../../server/lib/contracts/admin')
    const c = csrf()
    const handler = (await import('../../server/api/admin/events/[id]/activate.post')).default
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = adminAuth(adminId)
    event.context.params = { id: bId }
    const r = await handler(event)
    const parsed = EventSchema.parse(r)
    expect(parsed.id).toBe(bId)
    expect(parsed.isActive).toBe(true)

    const a = ctx.mem.public.one(`SELECT is_active FROM events WHERE id='${aId}'`) as { is_active: boolean }
    expect(a.is_active).toBe(false)

    const audit = ctx.mem.public.many(`SELECT action FROM audit_log WHERE action='event_activate'`)
    expect(audit.length).toBe(1)
  })
})
