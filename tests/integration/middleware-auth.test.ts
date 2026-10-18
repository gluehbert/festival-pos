import { describe, expect, it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ jwtSecret: 'x'.repeat(32), cookieDomain: 'localhost', databaseUrl: '' }),
}))

describe('global auth middleware', () => {
  it('populates an empty auth context when no cookies are present', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const mw = (await import('../../server/middleware/auth.global')).default
    const { event } = makeEvent({})
    await mw(event)
    expect(event.context.auth).toEqual({})
    expect(event.context.guest).toBeUndefined()
  })

  it('populates staff context when a valid staff JWT cookie is set', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { signStaffJwt } = await import('../../server/lib/auth')
    const mw = (await import('../../server/middleware/auth.global')).default

    const token = await signStaffJwt({ staffId: 'abc', role: 'waiter', username: 'tester', sessionVersion: 0 })
    const { event } = makeEvent({ cookies: { pos_staff: token } })
    await mw(event)
    expect(event.context.auth?.staff).toMatchObject({ staffId: 'abc', role: 'waiter', username: 'tester' })
  })

  it('silently ignores invalid staff cookies', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const mw = (await import('../../server/middleware/auth.global')).default
    const { event } = makeEvent({ cookies: { pos_staff: 'not-a-jwt' } })
    await mw(event)
    expect(event.context.auth?.staff).toBeUndefined()
  })

  it('drops staff context on API calls once the account is deactivated, and uses the current role', async () => {
    vi.resetModules()
    const { installCommonMocks, makeCtx, setCtx } = await import('../setup/route-mocks')
    await installCommonMocks()
    const ctx = await makeCtx()
    setCtx(ctx)
    const id = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('alice', 'h', 'admin') RETURNING id`,
    ) as { id: string }).id
    const { makeEvent } = await import('../setup/h3-event')
    const { signStaffJwt } = await import('../../server/lib/auth')
    const mw = (await import('../../server/middleware/auth.global')).default
    const token = await signStaffJwt({ staffId: id, role: 'admin', username: 'alice', sessionVersion: 0 })

    ctx.mem.public.none(`UPDATE staff SET role = 'waiter' WHERE id = '${id}'`)
    const demoted = makeEvent({ cookies: { pos_staff: token }, url: '/api/tickets' })
    await mw(demoted.event)
    expect(demoted.event.context.auth?.staff?.role).toBe('waiter')

    ctx.mem.public.none(`UPDATE staff SET is_active = false WHERE id = '${id}'`)
    const inactive = makeEvent({ cookies: { pos_staff: token }, url: '/api/tickets' })
    await mw(inactive.event)
    expect(inactive.event.context.auth?.staff).toBeUndefined()
  })

  it('accepts helpers who joined by link only while their event is active', async () => {
    vi.resetModules()
    const { installCommonMocks, makeCtx, setCtx } = await import('../setup/route-mocks')
    await installCommonMocks()
    const ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    const { eventId } = seedEvent(ctx.mem)
    const id = (ctx.mem.public.one(
      `INSERT INTO staff (username, role, event_id) VALUES ('Anna', 'waiter', '${eventId}') RETURNING id`,
    ) as { id: string }).id
    const { makeEvent } = await import('../setup/h3-event')
    const { signStaffJwt } = await import('../../server/lib/auth')
    const mw = (await import('../../server/middleware/auth.global')).default
    const token = await signStaffJwt({ staffId: id, role: 'waiter', username: 'Anna', sessionVersion: 0 })
    const staffOn = async () => {
      const { event } = makeEvent({ cookies: { pos_staff: token }, url: '/api/tickets' })
      await mw(event)
      return event.context.auth?.staff
    }
    expect(await staffOn()).toMatchObject({ staffId: id, username: 'Anna' })
    ctx.mem.public.none(`UPDATE events SET is_active = false WHERE id = '${eventId}'`)
    expect(await staffOn()).toBeUndefined()
  })

  it('rejects a token from before a PIN, role or active change (session version)', async () => {
    vi.resetModules()
    const { installCommonMocks, makeCtx, setCtx } = await import('../setup/route-mocks')
    await installCommonMocks()
    const ctx = await makeCtx()
    setCtx(ctx)
    const { call } = await import('../setup/call')
    const adminId = (ctx.mem.public.one(`INSERT INTO staff (username, password_hash, role) VALUES ('boss', 'h', 'admin') RETURNING id`) as { id: string }).id
    const id = (ctx.mem.public.one(`INSERT INTO staff (username, pin_hash, role) VALUES ('bob', 'h', 'waiter') RETURNING id`) as { id: string }).id
    const { makeEvent } = await import('../setup/h3-event')
    const { signStaffJwt } = await import('../../server/lib/auth')
    const mw = (await import('../../server/middleware/auth.global')).default
    const staffOn = async (token: string) => {
      const { event } = makeEvent({ cookies: { pos_staff: token }, url: '/api/tickets' })
      await mw(event)
      return event.context.auth?.staff
    }
    const before = await signStaffJwt({ staffId: id, role: 'waiter', username: 'bob', sessionVersion: 0 })
    expect(await staffOn(before)).toMatchObject({ staffId: id, role: 'waiter' })

    const admin = { staffId: adminId, role: 'admin' as const }
    const patch = (body: unknown) => call('../../server/api/admin/staff/[id].patch', { method: 'PATCH', staff: admin, params: { id }, body })
    // The same role again changes nothing.
    expect((await patch({ role: 'waiter' })).status).toBe(200)
    expect(await staffOn(before)).toBeDefined()

    expect((await patch({ pin: '9876' })).status).toBe(200)
    expect(await staffOn(before)).toBeUndefined()
    const afterPin = await signStaffJwt({ staffId: id, role: 'waiter', username: 'bob', sessionVersion: 1 })
    expect(await staffOn(afterPin)).toBeDefined()

    await patch({ role: 'bar' })
    expect(await staffOn(afterPin)).toBeUndefined()
    await patch({ isActive: false })
    await patch({ isActive: true })
    expect(ctx.mem.public.one(`SELECT session_version FROM staff WHERE id = '${id}'`)).toEqual({ session_version: 4 })
    const audit = ctx.mem.public.many(`SELECT payload FROM audit_log WHERE action = 'staff_update'`) as Array<{ payload: { sessionsRevoked: boolean } }>
    expect(audit.map((a) => a.payload.sessionsRevoked)).toEqual([false, true, true, true, true])
  })

  it('re-issues the cookie when an admin changes their own password', async () => {
    vi.resetModules()
    const { installCommonMocks, makeCtx, setCtx } = await import('../setup/route-mocks')
    await installCommonMocks()
    const ctx = await makeCtx()
    setCtx(ctx)
    const adminId = (ctx.mem.public.one(`INSERT INTO staff (username, password_hash, role) VALUES ('boss', 'h', 'admin') RETURNING id`) as { id: string }).id
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/staff/[id].patch')).default
    ctx.setBody({ password: 'ein-neues-passwort' })
    const { event } = makeEvent({ method: 'PATCH', cookies: { csrf: 'a'.repeat(64) }, headers: { 'x-csrf-token': 'a'.repeat(64) } })
    event.context.auth = { staff: { staffId: adminId, role: 'admin', username: 'boss' } }
    event.context.params = { id: adminId }
    await handler(event)
    const cookie = String(event.node.res.getHeader('set-cookie'))
    expect(cookie).toMatch(/^pos_staff=/)
    const { verifyStaffJwt } = await import('../../server/lib/auth')
    expect(await verifyStaffJwt(cookie.split(';')[0]!.slice('pos_staff='.length))).toMatchObject({ staffId: adminId, sessionVersion: 1 })
  })

  it('answers 503 instead of logging out when the database is down', async () => {
    vi.resetModules()
    const { installCommonMocks, makeCtx, setCtx } = await import('../setup/route-mocks')
    await installCommonMocks()
    const ctx = await makeCtx()
    ctx.db = { select: () => { throw new Error('connect ECONNREFUSED') } } as never
    setCtx(ctx)
    const { makeEvent } = await import('../setup/h3-event')
    const { signStaffJwt } = await import('../../server/lib/auth')
    const mw = (await import('../../server/middleware/auth.global')).default
    const token = await signStaffJwt({ staffId: 'abc', role: 'waiter', username: 'tester', sessionVersion: 0 })
    const { event } = makeEvent({ cookies: { pos_staff: token }, url: '/api/tickets' })
    await expect(mw(event)).rejects.toMatchObject({ statusCode: 503, data: { code: 'DB_UNAVAILABLE' } })
    expect(event.node.res.getHeader('retry-after')).toBe(2)
  })

  it('accepts tokens issued before session versions existed as version 0', async () => {
    const { SignJWT } = await import('jose')
    const { verifyStaffJwt } = await import('../../server/lib/auth')
    const old = await new SignJWT({ staffId: 'abc', role: 'waiter', username: 'u', kind: 'staff' })
      .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode('x'.repeat(32)))
    expect(await verifyStaffJwt(old)).toMatchObject({ staffId: 'abc', sessionVersion: 0 })
  })
})
