import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx

async function seedStaff(opts: {
  username: string
  password?: string
  pin?: string
  role?: 'admin' | 'waiter' | 'kitchen' | 'bar'
  isActive?: boolean
}): Promise<string> {
  const passwordHash = opts.password ? await bcrypt.hash(opts.password, 4) : null
  const pinHash = opts.pin ? await bcrypt.hash(opts.pin, 4) : null
  const row = ctx.mem.public.one(
    `INSERT INTO staff (username, password_hash, pin_hash, role, is_active)
     VALUES ('${opts.username}', ${passwordHash ? `'${passwordHash}'` : 'NULL'},
             ${pinHash ? `'${pinHash}'` : 'NULL'}, '${opts.role ?? 'waiter'}', ${opts.isActive ?? true})
     RETURNING id`,
  ) as { id: string }
  return row.id
}

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
  })

  it('StaffLoginSchema enforces required fields', async () => {
    const { StaffLoginSchema } = await import('../../server/lib/contracts/staff')
    expect(() => StaffLoginSchema.parse({ username: '', secret: 'x', kind: 'password' })).toThrow()
    expect(() => StaffLoginSchema.parse({ username: 'u', secret: 'x', kind: 'password' })).toThrow()
    expect(() => StaffLoginSchema.parse({ username: 'u', secret: 'abcd', kind: 'unknown' })).toThrow()
    expect(StaffLoginSchema.parse({ username: 'u', secret: 'abcd', kind: 'pin' })).toEqual({ username: 'u', secret: 'abcd', kind: 'pin' })
  })

  it('logs in via password and sets pos_staff cookie', async () => {
    await seedStaff({ username: 'alice', password: 'secret123', role: 'waiter' })
    const { makeEvent } = await import('../setup/h3-event')
    const { StaffSessionSchema } = await import('../../server/lib/contracts/staff')
    ctx.setBody({ username: 'alice', secret: 'secret123', kind: 'password' })
    const handler = (await import('../../server/api/auth/login.post')).default
    const { event, getSetCookies } = makeEvent({ method: 'POST' })
    const res = await handler(event)
    const parsed = StaffSessionSchema.parse(res)
    expect(parsed.username).toBe('alice')
    expect(parsed.role).toBe('waiter')
    expect(getSetCookies().some((c) => c.startsWith('pos_staff='))).toBe(true)
  })

  it('logs in via pin', async () => {
    await seedStaff({ username: 'bob', pin: '1234', role: 'waiter' })
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ username: 'bob', secret: '1234', kind: 'pin' })
    const handler = (await import('../../server/api/auth/login.post')).default
    const { event } = makeEvent({ method: 'POST' })
    const res = await handler(event) as { role: string }
    expect(res.role).toBe('waiter')
  })

  it('refuses a PIN login for admins, even with a PIN on file', async () => {
    await seedStaff({ username: 'boss', password: 'secret123456', pin: '1234', role: 'admin' })
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/auth/login.post')).default
    ctx.setBody({ username: 'boss', secret: '1234', kind: 'pin' })
    await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 401 })
    ctx.setBody({ username: 'boss', secret: 'secret123456', kind: 'password' })
    const res = await handler(makeEvent({ method: 'POST' }).event) as { role: string }
    expect(res.role).toBe('admin')
  })

  it('rejects wrong credentials with 401', async () => {
    await seedStaff({ username: 'alice', password: 'secret123' })
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ username: 'alice', secret: 'wrong', kind: 'password' })
    const handler = (await import('../../server/api/auth/login.post')).default
    const { event } = makeEvent({ method: 'POST' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects unknown user with 401', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ username: 'nope', secret: 'whatever', kind: 'password' })
    const handler = (await import('../../server/api/auth/login.post')).default
    const { event } = makeEvent({ method: 'POST' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects inactive account like a wrong password (401, no account-state leak)', async () => {
    await seedStaff({ username: 'eve', password: 'secret123', isActive: false })
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ username: 'eve', secret: 'secret123', kind: 'password' })
    const handler = (await import('../../server/api/auth/login.post')).default
    const { event } = makeEvent({ method: 'POST' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('POST /api/auth/login throttling', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
  })

  it('returns 429 after 10 failed attempts for the same username from one device, even with the right password', async () => {
    await seedStaff({ username: 'mallory-target', password: 'secret123' })
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/auth/login.post')).default
    for (let i = 0; i < 10; i++) {
      ctx.setBody({ username: 'mallory-target', secret: `wrong-${i}`, kind: 'password' })
      await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 401 })
    }
    ctx.setBody({ username: 'mallory-target', secret: 'secret123', kind: 'password' })
    await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('does not lock the user out on other devices: failures count per username and IP', async () => {
    await seedStaff({ username: 'waiter-x', pin: '4711' })
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/auth/login.post')).default
    const from = (ip: string) => makeEvent({ method: 'POST', headers: { 'x-forwarded-for': ip } }).event
    for (let i = 0; i < 10; i++) {
      ctx.setBody({ username: 'waiter-x', secret: `000${i}`, kind: 'pin' })
      await expect(handler(from('10.0.0.66'))).rejects.toMatchObject({ statusCode: 401 })
    }
    ctx.setBody({ username: 'waiter-x', secret: '4711', kind: 'pin' })
    await expect(handler(from('10.0.0.66'))).rejects.toMatchObject({ statusCode: 429 })
    const res = await handler(from('10.0.0.7')) as { username: string }
    expect(res.username).toBe('waiter-x')
    // The attacker's failures survive the waiter's successful login.
    const left = ctx.mem.public.many(`SELECT * FROM login_attempts WHERE username = 'waiter-x'`)
    expect(left.length).toBe(10)
  })

  it('clears the failure counter after a successful login', async () => {
    await seedStaff({ username: 'carol', password: 'secret123' })
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/auth/login.post')).default
    ctx.setBody({ username: 'carol', secret: 'nope', kind: 'password' })
    await expect(handler(makeEvent({ method: 'POST' }).event)).rejects.toMatchObject({ statusCode: 401 })
    ctx.setBody({ username: 'carol', secret: 'secret123', kind: 'password' })
    await handler(makeEvent({ method: 'POST' }).event)
    const rows = ctx.mem.public.many(`SELECT * FROM login_attempts WHERE username = 'carol'`)
    expect(rows.length).toBe(0)
  })
})

describe('POST /api/auth/logout', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
  })

  it('clears pos_staff cookie and returns { ok: true }', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const token = 'a'.repeat(64)
    const handler = (await import('../../server/api/auth/logout.post')).default
    const { event, getSetCookies } = makeEvent({
      method: 'POST',
      cookies: { csrf: token },
      headers: { 'x-csrf-token': token },
    })
    const res = await handler(event)
    expect(res).toEqual({ ok: true })
    expect(getSetCookies().some((c) => c.startsWith('pos_staff=') && /max-age=0|expires=/i.test(c))).toBe(true)
  })

  it('rejects without CSRF', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/auth/logout.post')).default
    const { event } = makeEvent({ method: 'POST' })
    await expect(handler(event)).rejects.toThrow(/CSRF/)
  })
})
