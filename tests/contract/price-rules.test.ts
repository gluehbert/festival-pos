import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'
import type { PriceRuleDto, PriceRulesList } from '../../server/lib/contracts/pricing'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const admin = () => ({ staffId: seeded.staffId, role: 'admin' as const })
const LIST = '../../server/api/admin/events/[id]/price-rules/index.get'
const CREATE = '../../server/api/admin/events/[id]/price-rules/index.post'
const PATCH = '../../server/api/admin/price-rules/[id].patch'
const DELETE = '../../server/api/admin/price-rules/[id].delete'

const happyHour = () => ({
  name: 'Happy Hour',
  startTime: '17:00',
  endTime: '18:00',
  menuItemIds: [seeded.menuItemIds[1]!],
  kind: 'fixed',
  value: 300,
})

describe('Preisregeln — admin contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-10T15:30:00Z')) // Fr 17:30 Berlin
  })
  afterEach(() => vi.useRealTimers())

  it('is for admins only', async () => {
    const waiter = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    expect((await call(LIST, { staff: waiter, params: { id: seeded.eventId } })).status).toBe(403)
    expect((await call(CREATE, { method: 'POST', staff: waiter, params: { id: seeded.eventId }, body: happyHour() })).status).toBe(403)
  })

  it('creates a rule, shows it as running with the preview, and audits it', async () => {
    const res = await call<PriceRuleDto>(CREATE, { method: 'POST', staff: admin(), params: { id: seeded.eventId }, body: happyHour() })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: 'Happy Hour', isActive: true, startTime: '17:00', endTime: '18:00', weekdays: [1, 2, 3, 4, 5, 6, 7],
      validFrom: null, validTo: null, categories: [], kind: 'fixed', value: 300, runningUntil: '2026-07-10T16:00:00.000Z',
    })

    const list = await call<PriceRulesList>(LIST, { staff: admin(), params: { id: seeded.eventId } })
    expect(list.body.rules).toHaveLength(1)
    expect(list.body.preview).toEqual([{
      menuItemId: seeded.menuItemIds[1], nameDe: 'Bier', nameEn: 'Beer', regularPriceCents: 400, priceCents: 300,
      ruleName: 'Happy Hour', endsAt: '2026-07-10T16:00:00.000Z',
    }])

    const audit = ctx.mem.public.one(`SELECT action, staff_id, target_kind, target_id FROM audit_log`)
    expect(audit).toEqual({ action: 'price_rule_create', staff_id: seeded.staffId, target_kind: 'price_rule', target_id: res.body.id })
  })

  it('rejects invalid rules', async () => {
    const bad = async (body: Record<string, unknown>) =>
      (await call(CREATE, { method: 'POST', staff: admin(), params: { id: seeded.eventId }, body: { ...happyHour(), ...body } })).status
    expect(await bad({ startTime: '25:00' })).toBe(400)
    expect(await bad({ menuItemIds: [], categories: [] })).toBe(400)
    expect(await bad({ kind: 'percent', value: 0 })).toBe(400)
    expect(await bad({ kind: 'percent', value: 101 })).toBe(400)
    expect(await bad({ kind: 'amount', value: 0 })).toBe(400)
    expect(await bad({ value: 2.5 })).toBe(400)
    expect(await bad({ weekdays: [] })).toBe(400)
    expect(await bad({ validFrom: '2026-07-12', validTo: '2026-07-11' })).toBe(400)
    expect(await bad({ menuItemIds: ['00000000-0000-4000-8000-000000000099'] })).toBe(400)
    expect(ctx.mem.public.one(`SELECT count(*)::int AS n FROM price_rules`)).toEqual({ n: 0 })
  })

  it('switches a rule off and on, edits it and audits each change', async () => {
    const created = await call<PriceRuleDto>(CREATE, { method: 'POST', staff: admin(), params: { id: seeded.eventId }, body: happyHour() })
    const id = created.body.id
    const off = await call<PriceRuleDto>(PATCH, { method: 'PATCH', staff: admin(), params: { id }, body: { isActive: false } })
    expect(off.body).toMatchObject({ isActive: false, runningUntil: null, name: 'Happy Hour' })

    const edited = await call<PriceRuleDto>(PATCH, {
      method: 'PATCH', staff: admin(), params: { id },
      body: { ...happyHour(), name: 'Spätschicht', startTime: '22:00', endTime: '02:00', weekdays: [5, 6], menuItemIds: [], categories: ['food'], kind: 'percent', value: 50 },
    })
    expect(edited.status).toBe(200)
    expect(edited.body).toMatchObject({ name: 'Spätschicht', isActive: true, startTime: '22:00', endTime: '02:00', weekdays: [5, 6], categories: ['food'], kind: 'percent', value: 50, runningUntil: null })

    const actions = ctx.mem.public.many(`SELECT action FROM audit_log ORDER BY created_at, action`) as Array<{ action: string }>
    expect(actions.map((a) => a.action).sort()).toEqual(['price_rule_create', 'price_rule_update', 'price_rule_update'])
    expect((await call(PATCH, { method: 'PATCH', staff: admin(), params: { id: '00000000-0000-4000-8000-000000000099' }, body: { isActive: true } })).status).toBe(404)
    expect((await call(PATCH, { method: 'PATCH', staff: admin(), params: { id: 'nope' }, body: { isActive: true } })).status).toBe(400)
  })

  it('deletes a rule and audits it', async () => {
    const created = await call<PriceRuleDto>(CREATE, { method: 'POST', staff: admin(), params: { id: seeded.eventId }, body: happyHour() })
    const res = await call(DELETE, { method: 'DELETE', staff: admin(), params: { id: created.body.id } })
    expect(res.body).toEqual({ id: created.body.id, deleted: true })
    expect(ctx.mem.public.one(`SELECT count(*)::int AS n FROM price_rules`)).toEqual({ n: 0 })
    const audit = ctx.mem.public.one(`SELECT payload FROM audit_log WHERE action = 'price_rule_delete'`) as { payload: { name: string } }
    expect(audit.payload.name).toBe('Happy Hour')
    expect((await call(DELETE, { method: 'DELETE', staff: admin(), params: { id: created.body.id } })).status).toBe(404)
  })

  it('refuses invalid rows at the database', () => {
    const insert = (kind: string, value: number, start = 0) => () => ctx.mem.public.none(
      `INSERT INTO price_rules (event_id, name, start_minute, end_minute, kind, value) VALUES ('${seeded.eventId}', 'x', ${start}, 60, '${kind}', ${value})`,
    )
    expect(insert('percent', 120)).toThrow()
    expect(insert('amount', 0)).toThrow()
    expect(insert('gift', 1)).toThrow()
    expect(insert('fixed', 100, 1440)).toThrow()
    expect(insert('fixed', 0)).not.toThrow()
  })
})
