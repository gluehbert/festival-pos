import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call } from '../setup/call'
import { PNG_1PX } from '../setup/fixtures'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const admin = () => ({ staffId: seeded.staffId, role: 'admin' as const })
const api = (route: string) => `../../server/api/${route}`

interface AuditRow { action: string; staff_id: string; target_kind: string; target_id: string; payload: Record<string, unknown> }
function audits(action: string): AuditRow[] {
  return ctx.mem.public.many(`SELECT action, staff_id, target_kind, target_id, payload FROM audit_log WHERE action = '${action}'`) as AuditRow[]
}

describe('audit log covers admin changes', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('logs creating an event without its guest PIN', async () => {
    const res = await call<{ id: string }>(api('admin/events/index.post'), {
      method: 'POST', staff: admin(), body: { name: 'Sommerfest', pinCode: 'SOMMER1', tableRangeFrom: 1, tableRangeTo: 30 },
    })
    expect(res.status).toBe(201)
    const [row] = audits('event_create')
    expect(row).toMatchObject({ staff_id: seeded.staffId, target_kind: 'event', target_id: res.body.id, payload: { name: 'Sommerfest', tableRangeTo: 30 } })
    expect(JSON.stringify(row!.payload)).not.toContain('SOMMER1')
  })

  it('logs creating and changing menu items with old and new values', async () => {
    const created = await call<{ id: string }>(api('admin/events/[id]/menu-items/index.post'), {
      method: 'POST', staff: admin(), params: { id: seeded.eventId },
      body: { nameDe: 'Radler', nameEn: 'Shandy', priceCents: 420, category: 'drink', station: 'bar' },
    })
    expect(created.status).toBe(201)
    expect(audits('menu_item_create')).toEqual([expect.objectContaining({ target_id: created.body.id, payload: expect.objectContaining({ nameDe: 'Radler', priceCents: 420 }) })])

    const fries = seeded.menuItemIds[0]!
    await call(api('admin/menu-items/[id].patch'), { method: 'PATCH', staff: admin(), params: { id: fries }, body: { priceCents: 400, nameDe: 'Pommes' } })
    expect(audits('menu_item_update')).toEqual([expect.objectContaining({
      target_id: fries,
      payload: { eventId: seeded.eventId, changes: { priceCents: { from: 350, to: 400 } } },
    })])
    // Saving without a real change leaves no entry.
    await call(api('admin/menu-items/[id].patch'), { method: 'PATCH', staff: admin(), params: { id: fries }, body: { priceCents: 400 } })
    expect(audits('menu_item_update')).toHaveLength(1)
  })

  it('logs an applied Excel/CSV import, not a dry run', async () => {
    const csv = ['Name (DE);Name (EN);Price (€);Category;Station', 'Pommes;Fries;3,80;food;Kitchen', 'Radler;Shandy;4,20;drink;Bar'].join('\n')
    const file = [{ name: 'file', filename: 'karte.csv', data: Buffer.from(csv, 'utf8') }]
    const route = api('admin/events/[id]/menu-items/import.post')
    await call(route, { method: 'POST', staff: admin(), params: { id: seeded.eventId }, url: '/x?dryRun=1', body: file })
    expect(audits('menu_import')).toEqual([])
    await call(route, { method: 'POST', staff: admin(), params: { id: seeded.eventId }, url: '/x', body: file })
    expect(audits('menu_import')).toEqual([expect.objectContaining({
      target_kind: 'event', target_id: seeded.eventId,
      payload: expect.objectContaining({ fileName: 'karte.csv', created: 1, updated: 1 }),
    })])
  })

  it('logs branding changes and asset upload/removal', async () => {
    const id = seeded.eventId
    await call(api('admin/events/[id]/branding.patch'), { method: 'PATCH', staff: admin(), params: { id }, body: { name: 'Neues Fest', program: 'x'.repeat(500) } })
    const [branding] = audits('event_update')
    expect(branding!.payload).toEqual({ fields: ['name', 'program'], name: 'Neues Fest' })

    const upload = await call(api('admin/events/[id]/assets/[kind].put'), {
      method: 'PUT', staff: admin(), params: { id, kind: 'logo' }, body: [{ name: 'file', filename: 'logo.png', data: PNG_1PX }],
    })
    expect(upload.status).toBe(200)
    expect(audits('asset_upload')).toEqual([expect.objectContaining({ payload: expect.objectContaining({ kind: 'logo', contentType: 'image/png', replaced: false }) })])
    await call(api('admin/events/[id]/assets/[kind].delete'), { method: 'DELETE', staff: admin(), params: { id, kind: 'logo' } })
    await call(api('admin/events/[id]/assets/[kind].delete'), { method: 'DELETE', staff: admin(), params: { id, kind: 'logo' } })
    expect(audits('asset_delete')).toEqual([expect.objectContaining({ target_id: id, payload: expect.objectContaining({ kind: 'logo' }) })])
  })

  it('keeps the trial switch and deleting test data apart', async () => {
    const id = seeded.eventId
    await call(api('admin/events/[id]/trial.put'), { method: 'PUT', staff: admin(), params: { id }, body: { enabled: true } })
    await call(api('admin/events/[id]/trial-data.delete'), { method: 'DELETE', staff: admin(), params: { id } })
    expect(audits('event_trial').map((a) => a.payload)).toEqual([{ trialMode: true }])
    expect(audits('event_trial_data_delete').map((a) => a.payload)).toEqual([{ deletedOrders: 0, deletedPayments: 0 }])
  })

  it('a failed change leaves no audit entry (same transaction)', async () => {
    await call(api('admin/staff/index.post'), { method: 'POST', staff: admin(), body: { username: 'anna', role: 'waiter', pin: '1234' } })
    const dup = await call(api('admin/staff/index.post'), { method: 'POST', staff: admin(), body: { username: 'anna', role: 'waiter', pin: '5678' } })
    expect(dup.status).toBe(409)
    expect(audits('staff_create')).toHaveLength(1)
  })
})
