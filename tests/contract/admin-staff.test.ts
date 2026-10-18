import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let adminId: string

function asRole(role: 'admin' | 'waiter', method = 'POST', url = '/api/admin/staff') {
  const e = makeEvent({ method, url, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  e.event.context.auth = { staff: { staffId: adminId, role, username: 'boss' } }
  return e.event
}

function withId(event: ReturnType<typeof asRole>, id: string) {
  event.context.params = { id }
  return event
}

describe('admin staff management', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    adminId = (ctx.mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('boss', 'h', 'admin') RETURNING id`,
    ) as { id: string }).id
  })

  it('creates a waiter with a PIN, never returning secrets', async () => {
    const create = (await import('../../server/api/admin/staff/index.post')).default
    ctx.setBody({ username: 'anna', role: 'waiter', pin: '4711' })
    const dto = await create(asRole('admin')) as Record<string, unknown>
    expect(dto).toMatchObject({ username: 'anna', role: 'waiter', isActive: true, hasPin: true, hasPassword: false })
    expect(JSON.stringify(dto)).not.toContain('4711')
    const audit = ctx.mem.public.many(`SELECT action FROM audit_log`)
    expect(audit).toEqual([{ action: 'staff_create' }])
  })

  it('rejects duplicates, weak secrets, admins without password and non-admin callers', async () => {
    const create = (await import('../../server/api/admin/staff/index.post')).default
    ctx.setBody({ username: 'boss', role: 'waiter', pin: '1234' })
    await expect(create(asRole('admin'))).rejects.toMatchObject({ statusCode: 409 })
    ctx.setBody({ username: 'kim', role: 'waiter', pin: '12' })
    await expect(create(asRole('admin'))).rejects.toMatchObject({ statusCode: 400 })
    ctx.setBody({ username: 'kim', role: 'admin', pin: '1234' })
    await expect(create(asRole('admin'))).rejects.toMatchObject({ statusCode: 400 })
    ctx.setBody({ username: 'kim', role: 'waiter', pin: '1234' })
    await expect(create(asRole('waiter'))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lists staff and updates role, PIN and active flag', async () => {
    const create = (await import('../../server/api/admin/staff/index.post')).default
    const patch = (await import('../../server/api/admin/staff/[id].patch')).default
    const list = (await import('../../server/api/admin/staff/index.get')).default
    ctx.setBody({ username: 'ben', role: 'kitchen', pin: '1111' })
    const ben = await create(asRole('admin')) as { id: string }

    ctx.setBody({ role: 'bar', pin: '2222', isActive: false })
    const updated = await patch(withId(asRole('admin', 'PATCH'), ben.id)) as { role: string; isActive: boolean }
    expect(updated).toMatchObject({ role: 'bar', isActive: false })

    const all = await list(asRole('admin', 'GET')) as { staff: Array<{ username: string }> }
    expect(all.staff.map((s) => s.username)).toEqual(['ben', 'boss'])
  })

  it('prevents admins from locking themselves out', async () => {
    const patch = (await import('../../server/api/admin/staff/[id].patch')).default
    ctx.setBody({ isActive: false })
    await expect(patch(withId(asRole('admin', 'PATCH'), adminId))).rejects.toMatchObject({ statusCode: 409 })
    ctx.setBody({ role: 'waiter' })
    await expect(patch(withId(asRole('admin', 'PATCH'), adminId))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('drops the PIN when promoting to admin and refuses a PIN for admins', async () => {
    const create = (await import('../../server/api/admin/staff/index.post')).default
    const patch = (await import('../../server/api/admin/staff/[id].patch')).default
    ctx.setBody({ username: 'lea', role: 'waiter', pin: '1234' })
    const lea = await create(asRole('admin')) as { id: string }

    ctx.setBody({ role: 'admin', password: 'a-long-password' })
    const promoted = await patch(withId(asRole('admin', 'PATCH'), lea.id)) as { hasPin: boolean; hasPassword: boolean }
    expect(promoted).toMatchObject({ hasPin: false, hasPassword: true })

    ctx.setBody({ pin: '9999' })
    await expect(patch(withId(asRole('admin', 'PATCH'), lea.id))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns 404 for unknown ids', async () => {
    const patch = (await import('../../server/api/admin/staff/[id].patch')).default
    ctx.setBody({ isActive: false })
    await expect(patch(withId(asRole('admin', 'PATCH'), '00000000-0000-4000-8000-000000000000')))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
