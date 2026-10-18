import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
const CSRF = 'c'.repeat(64)

async function seedStaff(username: string, role = 'waiter'): Promise<string> {
  const hash = await bcrypt.hash('secret123', 4)
  return (ctx.mem.public.one(
    `INSERT INTO staff (username, password_hash, role) VALUES ('${username}', '${hash}', '${role}') RETURNING id`,
  ) as { id: string }).id
}

async function signedIn(staffId: string, username: string, opts: { csrf?: boolean } = { csrf: true }) {
  const { makeEvent } = await import('../setup/h3-event')
  const e = makeEvent({
    method: 'PUT',
    cookies: opts.csrf ? { csrf: CSRF } : {},
    headers: opts.csrf ? { 'x-csrf-token': CSRF } : {},
  })
  e.event.context.auth = { staff: { staffId, role: 'waiter', username } }
  return e
}

function storedTheme(staffId: string): string {
  return (ctx.mem.public.one(`SELECT theme FROM staff WHERE id = '${staffId}'`) as { theme: string }).theme
}

describe('staff colour scheme', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
  })

  it('defaults to following the OS and is returned with login and /me', async () => {
    const id = await seedStaff('alice')
    expect(storedTheme(id)).toBe('system')

    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ username: 'alice', secret: 'secret123', kind: 'password' })
    const login = (await import('../../server/api/auth/login.post')).default
    expect(await login(makeEvent({ method: 'POST' }).event)).toMatchObject({ theme: 'system' })

    ctx.mem.public.none(`UPDATE staff SET theme = 'dark' WHERE id = '${id}'`)
    const me = (await import('../../server/api/auth/me.get')).default
    const e = makeEvent()
    e.event.context.auth = { staff: { staffId: id, role: 'waiter', username: 'alice' } }
    expect(await me(e.event)).toMatchObject({ username: 'alice', theme: 'dark' })
  })

  it('stores the choice on the signed-in account only', async () => {
    const alice = await seedStaff('alice')
    const bob = await seedStaff('bob', 'kitchen')
    const handler = (await import('../../server/api/auth/theme.put')).default

    ctx.setBody({ theme: 'dark' })
    expect(await handler((await signedIn(alice, 'alice')).event)).toEqual({ theme: 'dark' })
    expect(storedTheme(alice)).toBe('dark')
    expect(storedTheme(bob)).toBe('system')

    ctx.setBody({ theme: 'light' })
    await handler((await signedIn(alice, 'alice')).event)
    expect(storedTheme(alice)).toBe('light')
  })

  it('rejects unknown values, missing CSRF and anonymous callers', async () => {
    const alice = await seedStaff('alice')
    const handler = (await import('../../server/api/auth/theme.put')).default

    ctx.setBody({ theme: 'sepia' })
    await expect(handler((await signedIn(alice, 'alice')).event)).rejects.toMatchObject({ statusCode: 400 })

    ctx.setBody({ theme: 'dark' })
    await expect(handler((await signedIn(alice, 'alice', { csrf: false })).event)).rejects.toMatchObject({ statusCode: 403 })

    const { makeEvent } = await import('../setup/h3-event')
    const anon = makeEvent({ method: 'PUT', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
    await expect(handler(anon.event)).rejects.toMatchObject({ statusCode: 401 })
    expect(storedTheme(alice)).toBe('system')
  })
})
