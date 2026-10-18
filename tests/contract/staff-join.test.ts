import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCommonMocks, makeCtx, runtimeConfig, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let eventId: string
let adminId: string
const CSRF = 'c'.repeat(64)
const csrf = { cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } }

const cookieValue = (cookies: string[], name: string) =>
  cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0]!.slice(name.length + 1)

async function asAdmin<T>(path: string, params: Record<string, string>, body?: unknown): Promise<T> {
  const { makeEvent } = await import('../setup/h3-event')
  const e = makeEvent({ method: body === undefined ? 'GET' : 'POST', ...csrf })
  e.event.context.auth = { staff: { staffId: adminId, role: 'admin', username: 'admin' } }
  e.event.context.params = { id: eventId, ...params }
  if (body !== undefined) ctx.setBody(body)
  return (await (await import(`../../server/api/admin/events/[id]/${path}`)).default(e.event)) as T
}

async function join(code: string, name: string) {
  const { makeEvent } = await import('../setup/h3-event')
  const e = makeEvent({ method: 'POST', ...csrf })
  ctx.setBody({ code, name })
  const result = await (await import('../../server/api/join/index.post')).default(e.event)
  return { result, token: cookieValue(e.getSetCookies(), 'pos_join') }
}

async function status(token: string | undefined) {
  const { makeEvent } = await import('../setup/h3-event')
  const e = makeEvent({ cookies: token ? { pos_join: token } : {} })
  const result = await (await import('../../server/api/join/status.get')).default(e.event)
  return { result, staffCookie: cookieValue(e.getSetCookies(), 'pos_staff') }
}

type Overview = { code: string | null; url: string | null; pending: { id: string; name: string; rejoin: boolean }[]; members: { id: string; username: string; role: string }[] }
const overview = () => asAdmin<Overview>('join.get', {})
const decide = (requestId: string, body: unknown) => asAdmin('join-requests/[requestId].post', { requestId }, body)

describe('join by link with a waiting room', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    ;({ eventId, staffId: adminId } = seedEvent(ctx.mem))
  })

  afterEach(() => {
    runtimeConfig.public.appUrl = ''
    vi.unstubAllEnvs()
  })

  // NUXT_PUBLIC_APP_URL wins; without it the address the admin is on, never
  // VERCEL_PROJECT_PRODUCTION_URL.
  it('builds the join link from the configured URL, else the address the admin uses', async () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'vereins-av3rbeu43-team.vercel.app')
    const { code } = await asAdmin<{ code: string }>('join-code.post', {}, {})
    expect((await overview()).url).toBe(`http://localhost/staff/join/${code}`)

    runtimeConfig.public.appUrl = 'https://kasse.example.de/'
    expect((await overview()).url).toBe(`https://kasse.example.de/staff/join/${code}`)
  })

  it('lets a helper in only after the admin approved, then signs the device in once', async () => {
    expect((await overview()).code).toBeNull()
    const { code } = await asAdmin<{ code: string }>('join-code.post', {}, {})

    expect((await asAdmin<{ url: string }>('join.get', {})).url).toMatch(new RegExp(`/staff/join/${code}$`))

    const anna = await join(code, '  Anna ')
    expect(anna.result).toEqual({ status: 'pending', name: 'Anna' })
    expect(anna.token).toBeTruthy()
    expect((await status(anna.token)).result).toEqual({ status: 'pending', name: 'Anna' })
    expect((await status(anna.token)).staffCookie).toBeUndefined()

    const [req] = (await overview()).pending
    expect(req).toMatchObject({ name: 'Anna', rejoin: false })
    await decide(req!.id, { decision: 'approve', role: 'kitchen' })

    const signedIn = await status(anna.token)
    expect(signedIn.result).toEqual({ status: 'approved', name: 'Anna', role: 'kitchen' })
    expect(signedIn.staffCookie).toBeTruthy()
    expect((await overview()).members).toEqual([expect.objectContaining({ username: 'Anna', role: 'kitchen', isActive: true })])
    // The token is used up.
    await expect(status(anna.token)).rejects.toMatchObject({ statusCode: 404 })
    await expect(decide(req!.id, { decision: 'reject' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('defaults to Bedienung, turns people away and refuses old or unknown links', async () => {
    const { code } = await asAdmin<{ code: string }>('join-code.post', {}, {})
    const tom = await join(code, 'Tom')
    const lisa = await join(code, 'Lisa')
    const [t, l] = (await overview()).pending
    await decide(t!.id, { decision: 'approve' })
    await decide(l!.id, { decision: 'reject' })
    expect((await status(tom.token)).result).toMatchObject({ status: 'approved', role: 'waiter' })
    expect((await status(lisa.token)).result).toEqual({ status: 'rejected', name: 'Lisa' })

    const { code: fresh } = await asAdmin<{ code: string }>('join-code.post', {}, {})
    expect(fresh).not.toBe(code)
    await expect(join(code, 'Max')).rejects.toMatchObject({ statusCode: 404 })
    ctx.mem.public.none(`UPDATE events SET is_active = false`)
    await expect(join(fresh, 'Max')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('keeps names unique per event and signs a known name in again only with approval', async () => {
    const { code } = await asAdmin<{ code: string }>('join-code.post', {}, {})
    await join(code, 'Anna')
    await expect(join(code, 'anna')).rejects.toMatchObject({ statusCode: 409 })
    await expect(join(code, 'A')).rejects.toMatchObject({ statusCode: 400 })
    await decide((await overview()).pending[0]!.id, { decision: 'approve' })
    const annaId = (await overview()).members[0]!.id

    const again = await join(code, 'ANNA')
    const [req] = (await overview()).pending
    expect(req).toMatchObject({ name: 'ANNA', rejoin: true })
    await decide(req!.id, { decision: 'approve', role: 'bar' })
    expect((await status(again.token)).result).toMatchObject({ status: 'approved', name: 'Anna', role: 'bar' })
    expect((await overview()).members.map((m) => m.id)).toEqual([annaId])
  })

  it('gives a name to whoever is let in first when two people typed it at once', async () => {
    const { code } = await asAdmin<{ code: string }>('join-code.post', {}, {})
    const first = await join(code, 'Max')
    // The second request slipped in before the first one was let in.
    ctx.mem.public.none(`INSERT INTO staff_join_requests (event_id, name, token_hash) VALUES ('${eventId}', 'max', 'h2')`)
    const [a, b] = (await overview()).pending
    await decide(a!.id, { decision: 'approve' })
    await decide(b!.id, { decision: 'approve' })
    expect((await overview()).members.map((m) => m.username)).toEqual(['Max'])
    expect((await status(first.token)).result).toMatchObject({ status: 'approved', name: 'Max' })
  })

  it('caps the waiting room and is for admins only', async () => {
    const { code } = await asAdmin<{ code: string }>('join-code.post', {}, {})
    const { MAX_PENDING } = await import('../../server/lib/staff-join')
    for (let i = 0; i < MAX_PENDING; i++) await join(code, `Helfer ${i}`)
    await expect(join(code, 'Noch einer')).rejects.toMatchObject({ statusCode: 429 })

    const { makeEvent } = await import('../setup/h3-event')
    const e = makeEvent({ method: 'POST', ...csrf })
    e.event.context.auth = { staff: { staffId: adminId, role: 'waiter', username: 'w' } }
    e.event.context.params = { id: eventId }
    await expect((await import('../../server/api/admin/events/[id]/join-code.post')).default(e.event)).rejects.toMatchObject({ statusCode: 403 })
  })
})
