import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const PATCH = '../../server/api/admin/events/[id]/branding.patch'
const PUBLIC = '../../server/api/event/legal.get'

describe('Impressum / Datenschutz — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('admin maintains the texts per event; guests read them and see the footer flags', async () => {
    const admin = { staffId: seeded.staffId, role: 'admin' as const }
    const imprint = 'Musikverein Beispiel e. V.\nHauptstr. 1\n12345 Musterstadt'
    const saved = await call<{ hasImprint: boolean; hasPrivacy: boolean }>(PATCH, {
      method: 'PATCH', staff: admin, params: { id: seeded.eventId }, body: { imprintText: `  ${imprint}  `, privacyText: 'Wir speichern nur Bestellungen.' },
    })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ hasImprint: true, hasPrivacy: true })

    const pub = await call<{ eventName: string; imprintText: string; privacyText: string }>(PUBLIC)
    expect(pub.body).toEqual({ eventName: 'Demo', imprintText: imprint, privacyText: 'Wir speichern nur Bestellungen.' })
    const branding = await call<{ hasImprint: boolean }>('../../server/api/event/branding.get')
    expect(branding.body.hasImprint).toBe(true)

    const forAdmin = await call<{ imprintText: string }>('../../server/api/admin/events/[id]/legal.get', { staff: admin, params: { id: seeded.eventId } })
    expect(forAdmin.body.imprintText).toBe(imprint)

    // Emptying a text removes it, and the footer link with it.
    const cleared = await call<{ hasImprint: boolean; hasPrivacy: boolean }>(PATCH, {
      method: 'PATCH', staff: admin, params: { id: seeded.eventId }, body: { imprintText: '' },
    })
    expect(cleared.body).toMatchObject({ hasImprint: false, hasPrivacy: true })
    expect((await call<{ imprintText: null }>(PUBLIC)).body.imprintText).toBeNull()
  })

  it('validates length and roles', async () => {
    const admin = { staffId: seeded.staffId, role: 'admin' as const }
    expect((await call(PATCH, { method: 'PATCH', staff: admin, params: { id: seeded.eventId }, body: { privacyText: 'x'.repeat(20_001) } })).status).toBe(400)
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    expect((await call('../../server/api/admin/events/[id]/legal.get', { staff: waiter, params: { id: seeded.eventId } })).status).toBe(403)
    expect((await call(PATCH, { method: 'PATCH', staff: waiter, params: { id: seeded.eventId }, body: { imprintText: 'x' } })).status).toBe(403)
    expect((await call('../../server/api/admin/events/[id]/legal.get', { staff: admin, params: { id: '00000000-0000-4000-8000-000000000000' } })).status).toBe(404)
  })

  it('answers with empty texts when no event is active', async () => {
    ctx.mem.public.none(`UPDATE events SET is_active = false`)
    expect((await call(PUBLIC)).body).toEqual({ eventName: null, imprintText: null, privacyText: null })
  })
})
