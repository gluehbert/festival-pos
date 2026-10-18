import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const SESSION = '../../server/api/cash/session'

describe('cash drawer — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('validates amounts and roles', async () => {
    const { OpenCashSessionSchema, CloseCashSessionSchema } = await import('../../server/lib/contracts/cash')
    expect(() => OpenCashSessionSchema.parse({ openingCents: -1 })).toThrow()
    expect(() => OpenCashSessionSchema.parse({ openingCents: 1.5 })).toThrow()
    expect(CloseCashSessionSchema.parse({ countedCents: 0, note: '  ' }).note).toBe('')

    const kitchen = { staffId: insertStaff('kitchen'), role: 'kitchen' as const }
    expect((await call(`${SESSION}.get`, { staff: kitchen })).status).toBe(403)
    expect((await call(`${SESSION}.post`, { method: 'POST', staff: kitchen, body: { openingCents: 0 } })).status).toBe(403)
    expect((await call(`${SESSION}.get`)).status).toBe(401)
  })

  it('opens one drawer per waiter, reports it and refuses a second one', async () => {
    const waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' as const, username: 'anna' }
    expect((await call<{ session: null }>(`${SESSION}.get`, { staff: waiter })).body.session).toBeNull()

    const opened = await call<{ openingCents: number; expectedCents: number; closedAt: null; username: string }>(`${SESSION}.post`, {
      method: 'POST',
      staff: waiter,
      body: { openingCents: 10_000 },
    })
    expect(opened.status).toBe(201)
    expect(opened.body).toMatchObject({ openingCents: 10_000, expectedCents: 10_000, closedAt: null, username: 'anna' })

    const again = await call(`${SESSION}.post`, { method: 'POST', staff: waiter, body: { openingCents: 5 } })
    expect(again.status).toBe(409)

    const current = await call<{ session: { openingCents: number } }>(`${SESSION}.get`, { staff: waiter })
    expect(current.body.session.openingCents).toBe(10_000)

    const audit = ctx.mem.public.many(`SELECT action, target_kind FROM audit_log`) as Array<{ action: string; target_kind: string }>
    expect(audit).toEqual([{ action: 'cash_open', target_kind: 'cash_session' }])
  })

  it('cannot close without an open drawer and needs a valid count', async () => {
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    expect((await call(`${SESSION}/close.post`, { method: 'POST', staff: waiter, body: { countedCents: 100 } })).status).toBe(404)
    await call(`${SESSION}.post`, { method: 'POST', staff: waiter, body: { openingCents: 0 } })
    expect((await call(`${SESSION}/close.post`, { method: 'POST', staff: waiter, body: { countedCents: -5 } })).status).toBe(400)
  })

  it('lists drawers in the admin report and as CSV', async () => {
    const waiter = { staffId: insertStaff('waiter', 'ben'), role: 'waiter' as const, username: 'ben' }
    await call(`${SESSION}.post`, { method: 'POST', staff: waiter, body: { openingCents: 5000 } })
    const admin = { staffId: seeded.staffId, role: 'admin' as const }
    const report = await call<{ type: string; rows: Array<{ username: string; countedCents: null }> }>(
      '../../server/api/admin/events/[id]/reports.get',
      { staff: admin, params: { id: seeded.eventId }, url: `/api/admin/events/${seeded.eventId}/reports?type=cash_sessions` },
    )
    expect(report.status).toBe(200)
    expect(report.body.rows).toMatchObject([{ username: 'ben', countedCents: null }])

    const csv = await call<string>('../../server/api/admin/events/[id]/reports.get', {
      staff: admin,
      params: { id: seeded.eventId },
      url: `/api/admin/events/${seeded.eventId}/reports?type=cash_sessions&format=csv`,
    })
    expect(csv.body.split('\r\n')[0]).toContain('expectedCents;countedCents;differenceCents')
    expect(csv.body).toContain(';ben;')
  })
})
