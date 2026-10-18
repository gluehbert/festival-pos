import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let adminId: string

const CSRF = 'a'.repeat(64)
const csrf = () => ({ cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })

function adminAuth() {
  return { staff: { staffId: adminId, role: 'admin' as const, username: 'admin' } }
}

describe('US4 — single-active event (FR-030)', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    adminId = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('admin','h','admin') RETURNING id`,
    ) as { id: string }).id
  })

  it('activating B needs A ended first (partial unique constraint holds)', async () => {
    const aId = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active, activated_at)
       VALUES ('A', 'EVA01', 1, 10, true, now()) RETURNING id`,
    ) as { id: string }).id
    const bId = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
       VALUES ('B', 'EVB01', 1, 10, false) RETURNING id`,
    ) as { id: string }).id

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/activate.post')).default
    const endHandler = (await import('../../server/api/admin/events/[id]/end.post')).default
    const run = async (h: typeof handler, id: string) => {
      const c = csrf()
      const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
      event.context.auth = adminAuth()
      event.context.params = { id }
      await h(event)
    }
    await expect(run(handler, bId)).rejects.toMatchObject({ statusCode: 409 })
    await run(endHandler, aId)
    await run(handler, bId)

    const rows = ctx.mem.public.many(`SELECT id, is_active FROM events ORDER BY name`) as Array<{ id: string; is_active: boolean }>
    const a = rows.find((r) => r.id === aId)!
    const b = rows.find((r) => r.id === bId)!
    expect(a.is_active).toBe(false)
    expect(b.is_active).toBe(true)

    const activeCount = (ctx.mem.public.one(
      `SELECT count(*)::int AS n FROM events WHERE is_active=true`,
    ) as { n: number }).n
    expect(activeCount).toBe(1)
  })

  it('re-activating already-active event is a no-op (still one active)', async () => {
    const aId = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active, activated_at)
       VALUES ('A', 'EVA02', 1, 10, true, now()) RETURNING id`,
    ) as { id: string }).id

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/activate.post')).default
    const c = csrf()
    const { event } = makeEvent({ method: 'POST', cookies: c.cookies, headers: c.headers })
    event.context.auth = adminAuth()
    event.context.params = { id: aId }
    await handler(event)
    const n = (ctx.mem.public.one(
      `SELECT count(*)::int AS n FROM events WHERE is_active=true`,
    ) as { n: number }).n
    expect(n).toBe(1)
  })
})
