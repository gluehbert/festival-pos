import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

// The cryptography is @simplewebauthn/server's job (and its tests'). Here the
// verify functions are stubbed: they answer "valid" for whatever challenge the
// browser would have signed, but only if our expectedChallenge callback (the
// single-use DB lookup) accepts it. Everything around it is real.
const signed = { challenge: '' }
const verifyRegistrationResponse = vi.fn(async (opts: { expectedChallenge: (c: string) => Promise<boolean>; requireUserVerification?: boolean }) => {
  if (!(await opts.expectedChallenge(signed.challenge))) throw new Error('Unexpected challenge')
  expect(opts.requireUserVerification).toBe(true)
  return {
    verified: true,
    registrationInfo: { credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal', 'hybrid'] } },
  }
})
const verifyAuthenticationResponse = vi.fn(async (opts: { expectedChallenge: (c: string) => Promise<boolean>; requireUserVerification?: boolean; credential: { id: string } }) => {
  if (!(await opts.expectedChallenge(signed.challenge))) throw new Error('Unexpected challenge')
  expect(opts.requireUserVerification).toBe(true)
  return { verified: true, authenticationInfo: { newCounter: 7 } }
})

beforeAll(async () => {
  await installCommonMocks()
  vi.doMock('@simplewebauthn/server', async () => ({
    ...(await vi.importActual<typeof import('@simplewebauthn/server')>('@simplewebauthn/server')),
    verifyRegistrationResponse,
    verifyAuthenticationResponse,
  }))
})

let ctx: RouteTestCtx
const API = '../../server/api'

const regResponse = (id = 'cred-1') => ({
  id,
  rawId: id,
  type: 'public-key',
  response: { clientDataJSON: 'abc', attestationObject: 'def', transports: ['internal'] },
  clientExtensionResults: {},
})
const authResponse = (id = 'cred-1') => ({
  id,
  rawId: id,
  type: 'public-key',
  response: { clientDataJSON: 'abc', authenticatorData: 'def', signature: 'ghi' },
  clientExtensionResults: {},
})

async function register(staffId: string, username: string, name = 'iPhone von anna') {
  const opts = await call<{ challenge: string; authenticatorSelection: Record<string, string> }>(`${API}/auth/passkeys/register-options.post`, {
    method: 'POST',
    staff: { staffId, role: 'waiter', username },
  })
  expect(opts.status).toBe(200)
  signed.challenge = opts.body.challenge
  return await call<{ id: string; name: string }>(`${API}/auth/passkeys/register.post`, {
    method: 'POST',
    staff: { staffId, role: 'waiter', username },
    body: { name, response: regResponse() },
  })
}

async function passkeyLogin(id = 'cred-1') {
  const opts = await call<{ challenge: string; userVerification: string }>(`${API}/auth/passkeys/login-options.post`, { method: 'POST' })
  expect(opts.status).toBe(200)
  expect(opts.body.userVerification).toBe('required')
  signed.challenge = opts.body.challenge
  return await call<{ username: string; role: string }>(`${API}/auth/passkeys/login.post`, { method: 'POST', body: { response: authResponse(id) } })
}

describe('passkeys', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    signed.challenge = ''
  })

  it('registration needs a session and asks for a discoverable, user-verified passkey', async () => {
    expect((await call(`${API}/auth/passkeys/register-options.post`, { method: 'POST' })).status).toBe(401)
    const anna = insertStaff('waiter', 'anna')
    const opts = await call<{ challenge: string; authenticatorSelection: Record<string, string>; user: { name: string } }>(
      `${API}/auth/passkeys/register-options.post`,
      { method: 'POST', staff: { staffId: anna, role: 'waiter', username: 'anna' } },
    )
    expect(opts.body.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' })
    expect(opts.body.user.name).toBe('anna')
    expect(ctx.mem.public.many(`SELECT kind, staff_id FROM webauthn_challenges`)).toEqual([{ kind: 'register', staff_id: anna }])
  })

  it('stores the public key with an audit entry; the challenge works only once', async () => {
    const anna = insertStaff('waiter', 'anna')
    const res = await register(anna, 'anna')
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('iPhone von anna')
    expect(ctx.mem.public.one(`SELECT credential_id, transports, public_key FROM staff_passkeys`))
      .toEqual({ credential_id: 'cred-1', transports: 'internal,hybrid', public_key: 'AQID' })
    expect(ctx.mem.public.many(`SELECT action FROM audit_log`)).toEqual([{ action: 'passkey_add' }])

    const again = await call(`${API}/auth/passkeys/register.post`, {
      method: 'POST',
      staff: { staffId: anna, role: 'waiter', username: 'anna' },
      body: { name: 'x', response: regResponse() },
    })
    expect(again.status).toBe(400)
  })

  it("rejects a registration answering someone else's challenge", async () => {
    const anna = insertStaff('waiter', 'anna')
    const bob = insertStaff('waiter', 'bob')
    const opts = await call<{ challenge: string }>(`${API}/auth/passkeys/register-options.post`, { method: 'POST', staff: { staffId: anna, role: 'waiter', username: 'anna' } })
    signed.challenge = opts.body.challenge
    const res = await call(`${API}/auth/passkeys/register.post`, {
      method: 'POST',
      staff: { staffId: bob, role: 'waiter', username: 'bob' },
      body: { name: 'x', response: regResponse() },
    })
    expect(res.status).toBe(400)
    expect(ctx.mem.public.many(`SELECT id FROM staff_passkeys`)).toEqual([])
  })

  it('logs in without a username and issues the normal staff session, also for admins', async () => {
    const boss = insertStaff('admin', 'boss')
    await register(boss, 'boss', 'Mac')
    const res = await passkeyLogin()
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ username: 'boss', role: 'admin' })
    const row = ctx.mem.public.one(`SELECT counter, last_used_at FROM staff_passkeys`) as { counter: number; last_used_at: Date | null }
    expect(Number(row.counter)).toBe(7)
    expect(row.last_used_at).not.toBeNull()
  })

  it('sets the pos_staff cookie on a passkey login', async () => {
    const anna = insertStaff('waiter', 'anna')
    await register(anna, 'anna')
    const opts = await call<{ challenge: string }>(`${API}/auth/passkeys/login-options.post`, { method: 'POST' })
    signed.challenge = opts.body.challenge
    const { makeEvent } = await import('../setup/h3-event')
    ctx.setBody({ response: authResponse() })
    const handler = (await import('../../server/api/auth/passkeys/login.post')).default
    const { event, getSetCookies } = makeEvent({ method: 'POST' })
    await handler(event)
    expect(getSetCookies().some((c) => c.startsWith('pos_staff='))).toBe(true)
  })

  it('refuses a replayed login challenge, unknown passkeys and deactivated accounts', async () => {
    const anna = insertStaff('waiter', 'anna')
    await register(anna, 'anna')
    expect((await passkeyLogin()).status).toBe(200)
    // Same signed challenge again: already used.
    const replay = await call(`${API}/auth/passkeys/login.post`, { method: 'POST', body: { response: authResponse() } })
    expect(replay.status).toBe(401)

    expect((await passkeyLogin('nope')).status).toBe(401)

    ctx.mem.public.none(`UPDATE staff SET is_active = false WHERE id = '${anna}'`)
    expect((await passkeyLogin()).status).toBe(401)
    expect(Number((ctx.mem.public.one(`SELECT count(*) AS n FROM login_attempts`) as { n: number }).n)).toBe(3)
  })

  it('lists and removes only the own passkeys', async () => {
    const anna = insertStaff('waiter', 'anna')
    const bob = insertStaff('waiter', 'bob')
    const created = (await register(anna, 'anna')).body
    const list = await call<{ passkeys: Array<{ id: string; name: string }> }>(`${API}/auth/passkeys/index.get`, { staff: { staffId: anna, role: 'waiter' } })
    expect(list.body.passkeys.map((p) => p.name)).toEqual(['iPhone von anna'])
    expect((await call<{ passkeys: unknown[] }>(`${API}/auth/passkeys/index.get`, { staff: { staffId: bob, role: 'waiter' } })).body.passkeys).toEqual([])

    const foreign = await call(`${API}/auth/passkeys/[id].delete`, { method: 'DELETE', staff: { staffId: bob, role: 'waiter' }, params: { id: created.id } })
    expect(foreign.status).toBe(404)
    const own = await call(`${API}/auth/passkeys/[id].delete`, { method: 'DELETE', staff: { staffId: anna, role: 'waiter' }, params: { id: created.id } })
    expect(own.status).toBe(200)
    expect(ctx.mem.public.many(`SELECT id FROM staff_passkeys`)).toEqual([])
    // Removing the own passkey keeps the other sessions.
    expect(ctx.mem.public.one(`SELECT session_version FROM staff WHERE id = '${anna}'`)).toEqual({ session_version: 0 })
  })

  it('lets an admin remove a passkey, which ends all sessions of that account', async () => {
    const boss = insertStaff('admin', 'boss')
    const anna = insertStaff('waiter', 'anna')
    const created = (await register(anna, 'anna')).body
    const asWaiter = await call(`${API}/admin/staff/[id]/passkeys/index.get`, { staff: { staffId: anna, role: 'waiter' }, params: { id: anna } })
    expect(asWaiter.status).toBe(403)
    const list = await call<{ passkeys: unknown[] }>(`${API}/admin/staff/[id]/passkeys/index.get`, { staff: { staffId: boss, role: 'admin' }, params: { id: anna } })
    expect(list.body.passkeys).toHaveLength(1)

    const res = await call(`${API}/admin/staff/[id]/passkeys/[passkeyId].delete`, {
      method: 'DELETE',
      staff: { staffId: boss, role: 'admin' },
      params: { id: anna, passkeyId: created.id },
    })
    expect(res.status).toBe(200)
    expect(ctx.mem.public.one(`SELECT session_version FROM staff WHERE id = '${anna}'`)).toEqual({ session_version: 1 })
    expect(ctx.mem.public.many(`SELECT action, staff_id FROM audit_log ORDER BY created_at`).map((r) => (r as { action: string }).action))
      .toEqual(['passkey_add', 'passkey_remove'])
  })

  it('the sweep drops expired challenges', async () => {
    ctx.mem.public.none(`INSERT INTO webauthn_challenges (challenge, kind, expires_at) VALUES ('old', 'login', now() - interval '1 hour'), ('new', 'login', now() + interval '1 hour')`)
    const { sweep } = await import('../../server/lib/sweep')
    await sweep(ctx.db as never)
    expect(ctx.mem.public.many(`SELECT challenge FROM webauthn_challenges`)).toEqual([{ challenge: 'new' }])
  })
})
