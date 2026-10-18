import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
const CSRF = 'c'.repeat(64)
const NEXT = 'neues-passwort-123'

async function seedStaff(username: string, role: string, secrets: { password?: string; pin?: string }): Promise<string> {
  const pw = secrets.password ? `'${await bcrypt.hash(secrets.password, 4)}'` : 'NULL'
  const pin = secrets.pin ? `'${await bcrypt.hash(secrets.pin, 4)}'` : 'NULL'
  return (ctx.mem.public.one(
    `INSERT INTO staff (username, password_hash, pin_hash, role) VALUES ('${username}', ${pw}, ${pin}, '${role}') RETURNING id`,
  ) as { id: string }).id
}

async function call(staffId: string | null, username: string, body: unknown, opts: { csrf?: boolean; role?: 'admin' | 'waiter' } = { csrf: true }) {
  const { makeEvent } = await import('../setup/h3-event')
  const e = makeEvent({
    method: 'POST',
    cookies: opts.csrf ? { csrf: CSRF } : {},
    headers: opts.csrf ? { 'x-csrf-token': CSRF } : {},
  })
  if (staffId) e.event.context.auth = { staff: { staffId, role: opts.role ?? 'admin', username } }
  ctx.setBody(body)
  const handler = (await import('../../server/api/auth/password.post')).default
  return { result: handler(e.event), cookies: e.getSetCookies }
}

function row(id: string) {
  return ctx.mem.public.one(`SELECT password_hash, session_version FROM staff WHERE id = '${id}'`) as { password_hash: string; session_version: number }
}

describe('POST /api/auth/password', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
  })

  it('changes the own password, logs out other devices and keeps this one', async () => {
    const id = await seedStaff('anna', 'admin', { password: 'altes-passwort-1' })
    const { result, cookies } = await call(id, 'anna', { current: 'altes-passwort-1', next: NEXT })
    expect(await result).toEqual({ ok: true })
    const r = row(id)
    expect(await bcrypt.compare(NEXT, r.password_hash)).toBe(true)
    expect(r.session_version).toBe(1)
    expect(cookies().some((c) => c.startsWith('pos_staff='))).toBe(true)
    const audit = ctx.mem.public.one(`SELECT action, payload FROM audit_log WHERE target_id = '${id}'`) as { action: string; payload: Record<string, unknown> }
    expect(audit.action).toBe('staff_update')
    expect(JSON.stringify(audit.payload)).not.toContain(NEXT)
  })

  it('is for admins only and never accepts a PIN', async () => {
    const ben = await seedStaff('ben', 'waiter', { pin: '1234' })
    await expect((await call(ben, 'ben', { current: '1234', next: NEXT }, { csrf: true, role: 'waiter' })).result).rejects.toMatchObject({ statusCode: 403 })

    const admin = await seedStaff('chef', 'admin', { password: 'admin-passwort-1', pin: '9999' })
    await expect((await call(admin, 'chef', { current: '9999', next: NEXT })).result).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a wrong current password, short ones, missing CSRF and anonymous callers', async () => {
    const id = await seedStaff('anna', 'admin', { password: 'altes-passwort-1' })
    await expect((await call(id, 'anna', { current: 'falsch-falsch', next: NEXT })).result).rejects.toMatchObject({ statusCode: 400 })
    await expect((await call(id, 'anna', { current: 'altes-passwort-1', next: 'kurz' })).result).rejects.toMatchObject({ statusCode: 400 })
    await expect((await call(id, 'anna', { current: 'altes-passwort-1', next: NEXT }, { csrf: false })).result).rejects.toMatchObject({ statusCode: 403 })
    await expect((await call(null, '', { current: 'altes-passwort-1', next: NEXT })).result).rejects.toMatchObject({ statusCode: 401 })
    expect(await bcrypt.compare('altes-passwort-1', row(id).password_hash)).toBe(true)
  })

  it('counts wrong attempts like failed logins', async () => {
    const id = await seedStaff('anna', 'admin', { password: 'altes-passwort-1' })
    let last: unknown
    for (let i = 0; i < 12; i++) {
      last = await (await call(id, 'anna', { current: 'falsch-falsch', next: NEXT })).result.catch((e) => e)
    }
    expect(last).toMatchObject({ statusCode: 429 })
  })
})
