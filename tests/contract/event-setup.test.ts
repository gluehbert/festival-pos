import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call } from '../setup/call'
import type { Setup } from '../../server/lib/contracts/setup'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const EV = '../../server/api/admin/events/[id]'
const admin = () => ({ staffId: seeded.staffId, role: 'admin' as const })
const params = () => ({ id: seeded.eventId })
const load = () => call<Setup>(`${EV}/setup.get`, { staff: admin(), params: params() })
const confirm = (steps: string[]) => call<Setup>(`${EV}/setup.post`, { method: 'POST', staff: admin(), params: params(), body: { steps } })
const trial = (enabled: boolean) => call(`${EV}/trial.put`, { method: 'PUT', staff: admin(), params: params(), body: { enabled } })
const trialOrder = () => ctx.mem.public.none(
  `INSERT INTO orders (event_id, table_no, kind, created_by_staff, is_trial) VALUES ('${seeded.eventId}', 2, 'staff_table', '${seeded.staffId}', true)`,
)

describe('guided setup on the server', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('reports what the data shows', async () => {
    const res = await load()
    expect(res.status).toBe(200)
    expect(res.body.confirmed).toEqual([])
    expect(res.body.facts).toMatchObject({ branded: false, menuItems: seeded.menuItemIds.length, priceRules: 0, helpers: 0, qrDownloadedAt: null, trialHeldAt: null })

    ctx.mem.public.none(`UPDATE events SET welcome_text = 'Willkommen!' WHERE id = '${seeded.eventId}'`)
    ctx.mem.public.none(`INSERT INTO staff_join_requests (event_id, name, token_hash, status) VALUES ('${seeded.eventId}', 'Anna', 'x1', 'approved'), ('${seeded.eventId}', 'Ben', 'x2', 'pending')`)
    expect((await load()).body.facts).toMatchObject({ branded: true, helpers: 1 })
  })

  it('keeps "Weiter" for every device, merged and without duplicates', async () => {
    expect((await confirm(['branding'])).body.confirmed).toEqual(['branding'])
    expect((await confirm(['branding', 'settings'])).body.confirmed).toEqual(['branding', 'settings'])
    expect((await load()).body.confirmed).toEqual(['branding', 'settings'])
    expect((await confirm(['nonsense'])).status).toBe(400)
  })

  it('ticks off the QR codes once the PDF was downloaded', async () => {
    const res = await call(`${EV}/qr-codes.get`, { staff: admin(), params: params(), url: `/api/admin/events/${seeded.eventId}/qr-codes?from=1&to=2` })
    expect(res.status).toBe(200)
    expect((await load()).body.facts.qrDownloadedAt).not.toBeNull()
  })

  it('counts a rehearsal only when it had test orders', async () => {
    await trial(true)
    await trial(false)
    expect((await load()).body.facts.trialHeldAt).toBeNull()
    await trial(true)
    trialOrder()
    await trial(false)
    expect((await load()).body.facts.trialHeldAt).not.toBeNull()
  })

  it('counts a rehearsal whose test orders were deleted first', async () => {
    await trial(true)
    trialOrder()
    expect((await call(`${EV}/trial-data.delete`, { method: 'DELETE', staff: admin(), params: params() })).status).toBe(200)
    expect((await load()).body.facts.trialHeldAt).not.toBeNull()
  })

  it('needs an admin', async () => {
    expect((await call(`${EV}/setup.get`, { staff: { staffId: seeded.staffId, role: 'waiter' }, params: params() })).status).toBe(403)
    expect((await call(`${EV}/setup.post`, { method: 'POST', staff: { staffId: seeded.staffId, role: 'lead' }, params: params(), body: { steps: ['qr'] } })).status).toBe(403)
  })
})
