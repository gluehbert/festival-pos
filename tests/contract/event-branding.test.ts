import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'
import { PNG_1PX, squarePng } from '../setup/fixtures'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let eventId: string
// The seeded admin: audit rows reference a real staff member.
let adminId: string

function adminReq(method: string, kind?: 'logo' | 'logo_dark' | 'flyer', role: 'admin' | 'waiter' = 'admin') {
  const e = makeEvent({ method, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  e.event.context.auth = { staff: { staffId: adminId, role, username: 'a' } }
  e.event.context.params = { id: eventId, ...(kind ? { kind } : {}) }
  return e
}

describe('event branding', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    const seeded = seedEvent(ctx.mem)
    eventId = seeded.eventId
    adminId = seeded.staffId
  })

  it('public branding is empty-but-valid without customisation', async () => {
    const pub = (await import('../../server/api/event/branding.get')).default
    expect(await pub(makeEvent().event)).toMatchObject({
      eventId, eventName: 'Demo', accentColor: null, logoUrl: null, flyerUrl: null, program: null,
    })
  })

  it('admin saves colour, greeting and programme; guests see them', async () => {
    const patch = (await import('../../server/api/admin/events/[id]/branding.patch')).default
    ctx.setBody({ accentColor: '#E30613', welcomeText: 'Willkommen!', program: '18:00 Fassanstich' })
    expect(await patch(adminReq('PATCH').event)).toMatchObject({ accentColor: '#e30613', welcomeText: 'Willkommen!' })

    ctx.setBody({ welcomeText: '' })
    expect(await patch(adminReq('PATCH').event)).toMatchObject({ accentColor: '#e30613', welcomeText: null, program: '18:00 Fassanstich' })

    ctx.setBody({ accentColor: 'rot' })
    await expect(patch(adminReq('PATCH').event)).rejects.toMatchObject({ statusCode: 400 })
    ctx.setBody({ accentColor: '#000000' })
    await expect(patch(adminReq('PATCH', undefined, 'waiter').event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('renames the event (trimmed), rejects an empty name and keeps other fields', async () => {
    const patch = (await import('../../server/api/admin/events/[id]/branding.patch')).default
    ctx.setBody({ accentColor: '#e30613' })
    await patch(adminReq('PATCH').event)
    ctx.setBody({ name: '  Sommerfest 2026  ' })
    expect(await patch(adminReq('PATCH').event)).toMatchObject({ eventName: 'Sommerfest 2026', accentColor: '#e30613' })
    expect(ctx.mem.public.one(`SELECT name FROM events WHERE id = '${eventId}'`)).toEqual({ name: 'Sommerfest 2026' })

    for (const name of ['', '   ', 'x'.repeat(201)]) {
      ctx.setBody({ name })
      await expect(patch(adminReq('PATCH').event)).rejects.toMatchObject({ statusCode: 400 })
    }
    const pub = (await import('../../server/api/event/branding.get')).default
    expect(await pub(makeEvent().event)).toMatchObject({ eventName: 'Sommerfest 2026' })
  })

  it('uploads, serves (cacheable by version), replaces and deletes a logo', async () => {
    const put = (await import('../../server/api/admin/events/[id]/assets/[kind].put')).default
    const get = (await import('../../server/api/events/[id]/assets/[kind].get')).default
    const del = (await import('../../server/api/admin/events/[id]/assets/[kind].delete')).default

    ctx.setBody([{ name: 'file', filename: 'logo.svg', data: Buffer.from('<svg/>') }])
    await expect(put(adminReq('PUT', 'logo').event)).rejects.toMatchObject({ statusCode: 400 })

    ctx.setBody([{ name: 'file', filename: 'logo.png', data: PNG_1PX }])
    const branding = await put(adminReq('PUT', 'logo').event) as { logoUrl: string }
    expect(branding.logoUrl).toMatch(new RegExp(`^/api/events/${eventId}/assets/logo\\?v=[0-9a-f]{16}$`))

    const req = makeEvent({ url: branding.logoUrl })
    req.event.context.params = { id: eventId, kind: 'logo' }
    const body = await get(req.event) as Buffer
    expect(body.equals(PNG_1PX)).toBe(true)
    expect(req.getHeader('content-type')).toBe('image/png')
    expect(req.getHeader('cache-control')).toBe('public, max-age=31536000, immutable')

    // An outdated version must not be cached forever.
    const stale = makeEvent({ url: `/api/events/${eventId}/assets/logo?v=0000000000000000` })
    stale.event.context.params = { id: eventId, kind: 'logo' }
    await get(stale.event)
    expect(stale.getHeader('cache-control')).toBe('public, max-age=0, must-revalidate')

    ctx.setBody([{ name: 'file', filename: 'flyer.pdf', data: Buffer.from('%PDF-1.7 test') }])
    expect(await put(adminReq('PUT', 'flyer').event)).toMatchObject({ flyerType: 'pdf' })
    expect(ctx.mem.public.many(`SELECT kind FROM event_assets ORDER BY kind`)).toEqual([{ kind: 'flyer' }, { kind: 'logo' }])

    expect(await del(adminReq('DELETE', 'logo').event)).toMatchObject({ logoUrl: null })
    const missing = makeEvent()
    missing.event.context.params = { id: eventId, kind: 'logo' }
    await expect(get(missing.event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('checks a logo for dark mode on upload and serves an optional dark-mode logo', async () => {
    const put = (await import('../../server/api/admin/events/[id]/assets/[kind].put')).default
    const del = (await import('../../server/api/admin/events/[id]/assets/[kind].delete')).default

    ctx.setBody([{ name: 'file', filename: 'logo.png', data: squarePng([255, 255, 255, 255], [0, 0, 0, 0]) }])
    expect(await put(adminReq('PUT', 'logo').event)).toMatchObject({ logoFitsDark: true, logoDarkUrl: null })

    ctx.setBody([{ name: 'file', filename: 'logo.png', data: squarePng([227, 6, 19, 255], [255, 255, 255, 255]) }])
    expect(await put(adminReq('PUT', 'logo').event)).toMatchObject({ logoFitsDark: false })

    ctx.setBody([{ name: 'file', filename: 'logo-dark.png', data: PNG_1PX }])
    const withDark = await put(adminReq('PUT', 'logo_dark').event) as { logoDarkUrl: string }
    expect(withDark.logoDarkUrl).toMatch(new RegExp(`^/api/events/${eventId}/assets/logo_dark\\?v=[0-9a-f]{16}$`))
    expect(ctx.mem.public.one(`SELECT fits_dark FROM event_assets WHERE kind = 'logo_dark'`)).toEqual({ fits_dark: null })

    expect(await del(adminReq('DELETE', 'logo_dark').event)).toMatchObject({ logoDarkUrl: null, logoUrl: expect.any(String) })
  })

  it('checks logos uploaded before the dark-mode check once, on first use', async () => {
    const data = squarePng([255, 255, 255, 255], [0, 0, 0, 0]).toString('base64')
    ctx.mem.public.none(`INSERT INTO event_assets (event_id, kind, content_type, data_base64, byte_size, sha256)
      VALUES ('${eventId}', 'logo', 'image/png', '${data}', 100, '${'b'.repeat(64)}')`)
    const pub = (await import('../../server/api/event/branding.get')).default
    expect(await pub(makeEvent().event)).toMatchObject({ logoFitsDark: true })
    expect(ctx.mem.public.one(`SELECT fits_dark FROM event_assets WHERE kind = 'logo'`)).toEqual({ fits_dark: true })
  })
})
