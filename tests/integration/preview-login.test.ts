import process from 'node:process'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getCtx, installCommonMocks, makeCtx, setCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)

async function login(as: string, csrf = true) {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/preview/login.post')).default
  getCtx().setBody({ as })
  const { event, getSetCookies } = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: csrf ? { 'x-csrf-token': CSRF } : {} })
  try {
    const body = await handler(event) as { to: string }
    return { status: 200, body, cookies: getSetCookies() }
  }
  catch (err) {
    return { status: (err as { statusCode?: number }).statusCode ?? 500, body: null, cookies: getSetCookies() }
  }
}

const accounts = () => getCtx().mem.public.many(`SELECT username, role, password_hash FROM staff WHERE username LIKE 'preview-%' ORDER BY username`) as Array<{ username: string; role: string; password_hash: string | null }>

describe('one-tap login on Vercel preview deployments', () => {
  const before = process.env.VERCEL_ENV
  beforeEach(async () => {
    setCtx(await makeCtx())
    const { seedEvent } = await import('../setup/pg-mem-db')
    seedEvent(getCtx().mem, { tableRangeFrom: 3, tableRangeTo: 9 })
  })
  afterEach(() => {
    if (before === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = before
  })

  it('does not exist in production or locally', async () => {
    for (const env of ['production', 'development', undefined]) {
      if (env === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = env
      expect((await login('admin')).status).toBe(404)
    }
    expect(accounts()).toEqual([])
  })

  it('signs in as each staff role and lands on its home page', async () => {
    process.env.VERCEL_ENV = 'preview'
    const homes = { waiter: '/staff', lead: '/staff', kitchen: '/production', bar: '/production', admin: '/admin/events' }
    for (const [as, to] of Object.entries(homes)) {
      const res = await login(as)
      expect(res.body).toEqual({ to })
      expect(res.cookies.some((c) => c.startsWith('pos_staff='))).toBe(true)
    }
    // Created once with an unknown password, reused afterwards.
    await login('waiter')
    expect(accounts().map((a) => [a.username, a.role])).toEqual([
      ['preview-admin', 'admin'], ['preview-bar', 'bar'], ['preview-kitchen', 'kitchen'], ['preview-lead', 'lead'], ['preview-waiter', 'waiter'],
    ])
    expect(accounts().every((a) => a.password_hash?.startsWith('$2'))).toBe(true)
  })

  it('reactivates a deactivated preview account', async () => {
    process.env.VERCEL_ENV = 'preview'
    await login('bar')
    getCtx().mem.public.none(`UPDATE staff SET is_active = false WHERE username = 'preview-bar'`)
    expect((await login('bar')).status).toBe(200)
    expect(getCtx().mem.public.one(`SELECT is_active FROM staff WHERE username = 'preview-bar'`)).toEqual({ is_active: true })
  })

  it('seats a guest at the first table of the active event', async () => {
    process.env.VERCEL_ENV = 'preview'
    const res = await login('guest')
    expect(res.body).toEqual({ to: '/t/3' })
    expect(res.cookies.some((c) => c.startsWith('pos_guest='))).toBe(true)
    expect(getCtx().mem.public.many(`SELECT table_no FROM guest_sessions`)).toEqual([{ table_no: 3 }])
  })

  it('creates a sample fest when the preview database has no active event', async () => {
    process.env.VERCEL_ENV = 'preview'
    const mem = getCtx().mem.public
    mem.none(`UPDATE events SET is_active = false`)
    expect((await login('guest')).body).toEqual({ to: '/t/1' })
    const ev = mem.one(`SELECT id, name, is_active, deposit_enabled FROM events WHERE pin_code = 'PREVIEW1'`) as { id: string; name: string; is_active: boolean; deposit_enabled: boolean }
    expect(ev).toMatchObject({ name: 'Preview-Fest', is_active: true, deposit_enabled: true })
    expect((mem.one(`SELECT count(*)::int AS n FROM menu_items WHERE event_id = '${ev.id}'`) as { n: number }).n).toBe(12)
    // Open orders of preview-waiter: table 3 in the works, 5 and 7 ready to bring.
    const tables = mem.many(`SELECT o.table_no, i.production_status FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.event_id = '${ev.id}' ORDER BY o.table_no, i.production_status`) as Array<{ table_no: number; production_status: string }>
    expect([...new Set(tables.map((t) => `${t.table_no}:${t.production_status}`))]).toEqual(['3:pending', '5:done', '7:done'])
    expect(mem.many(`SELECT a.table_no FROM table_assignments a JOIN staff s ON s.id = a.staff_id WHERE s.username = 'preview-waiter' ORDER BY a.table_no`)).toEqual([{ table_no: 3 }, { table_no: 5 }, { table_no: 7 }])

    // Only once; a deactivated Preview-Fest comes back instead of a second one.
    await login('waiter')
    mem.none(`UPDATE events SET is_active = false`)
    await login('kitchen')
    expect(mem.many(`SELECT is_active FROM events WHERE pin_code = 'PREVIEW1'`)).toEqual([{ is_active: true }])
    expect((mem.one(`SELECT count(*)::int AS n FROM orders`) as { n: number }).n).toBe(3)
  })

  it('checks CSRF and the role', async () => {
    process.env.VERCEL_ENV = 'preview'
    expect((await login('admin', false)).status).toBe(403)
    expect((await login('boss')).status).toBe(400)
  })
})
