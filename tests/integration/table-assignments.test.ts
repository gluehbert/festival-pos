import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff, type Role } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let anna: string
let ben: string

const API = '../../server/api'
const as = (staffId: string, role: Role = 'waiter') => ({ staffId, role })
const assign = (staffId: string, tableNo: number, body: unknown = {}, role: Role = 'waiter') =>
  call<{ tableNo: number; assignee: { staffId: string; username: string } | null }>(`${API}/tickets/[id]/assign.post`, {
    method: 'POST', staff: as(staffId, role), params: { id: `t-${tableNo}` }, body,
  })
const release = (staffId: string, tableNo: number, role: Role = 'waiter') =>
  call<{ assignee: unknown }>(`${API}/tickets/[id]/assign.delete`, { method: 'DELETE', staff: as(staffId, role), params: { id: `t-${tableNo}` } })
const order = (staffId: string, tableNo: number, role: Role = 'waiter', mode = 'staff_table') =>
  call<{ orderId: string }>(`${API}/orders/index.post`, {
    method: 'POST', staff: as(staffId, role), body: { tableNo, mode, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] },
  })

type Summary = { ticketKey: string; tableNo: number; assignee: { staffId: string; username: string } | null }
type List = { tickets: Summary[]; assignments: Array<{ tableNo: number; staffId: string; username: string }>; tableRange: { from: number; to: number } }
const list = async () => (await call<List>(`${API}/tickets/index.get`, { staff: as(anna) })).body
const holders = () => ctx.mem.public.many(`SELECT table_no, staff_id FROM table_assignments ORDER BY table_no`) as Array<{ table_no: number; staff_id: string }>
const audits = (action: string) => ctx.mem.public.many(`SELECT * FROM audit_log WHERE action = '${action}'`) as Array<{ staff_id: string; payload: Record<string, unknown> }>

describe('Meine Tische — table assignments', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 12 })
    anna = insertStaff('waiter', 'anna')
    ben = insertStaff('waiter', 'ben')
  })

  it('lets a waiter take several tables and give one back', async () => {
    const r = await assign(anna, 3)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ tableNo: 3, assignee: { staffId: anna, username: 'anna' } })
    expect((await assign(anna, 5)).status).toBe(200)
    // Taking your own table again is a no-op.
    expect((await assign(anna, 5)).status).toBe(200)
    expect(holders().map((h) => h.table_no)).toEqual([3, 5])

    const back = await release(anna, 3)
    expect(back.status).toBe(200)
    expect(back.body.assignee).toBeNull()
    expect(holders().map((h) => h.table_no)).toEqual([5])
    // Giving back a free table is harmless.
    expect((await release(anna, 3)).status).toBe(200)
  })

  it('refuses someone else\'s table without takeOver and audits the takeover', async () => {
    await assign(anna, 4)
    const refused = await assign(ben, 4)
    expect(refused.status).toBe(409)
    expect(refused.error).toMatchObject({ code: 'TABLE_TAKEN', details: { assignee: { staffId: anna, username: 'anna' } } })
    expect(holders()).toEqual([{ table_no: 4, staff_id: anna }])

    const taken = await assign(ben, 4, { takeOver: true })
    expect(taken.status).toBe(200)
    expect(taken.body.assignee).toEqual({ staffId: ben, username: 'ben' })
    expect(holders()).toEqual([{ table_no: 4, staff_id: ben }])
    const log = audits('table_takeover')
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ staff_id: ben, payload: { tableNo: 4, previousStaffId: anna, previousUsername: 'anna' } })
    // takeOver on a free table needs no audit.
    await assign(ben, 6, { takeOver: true })
    expect(audits('table_takeover')).toHaveLength(1)
  })

  it('lets only the holder or an admin free a table', async () => {
    await assign(anna, 2)
    expect((await release(ben, 2)).status).toBe(409)
    expect(holders()).toHaveLength(1)
    expect((await release(seeded.staffId, 2, 'admin')).status).toBe(200)
    expect(holders()).toHaveLength(0)
    expect(audits('table_release')[0]).toMatchObject({ staff_id: seeded.staffId, payload: { tableNo: 2, previousStaffId: anna } })
  })

  it('guards role, CSRF, key and table number', async () => {
    const kitchen = insertStaff('kitchen')
    expect((await assign(kitchen, 1, {}, 'kitchen')).status).toBe(403)
    expect((await release(kitchen, 1, 'kitchen')).status).toBe(403)
    expect((await call(`${API}/tickets/[id]/assign.post`, { method: 'POST', params: { id: 't-1' } })).status).toBe(401)
    const walk = await call(`${API}/tickets/[id]/assign.post`, { method: 'POST', staff: as(anna), params: { id: 'w-00000000-0000-4000-8000-000000000000' } })
    expect(walk.status).toBe(400)
    expect((await assign(anna, 0)).status).toBe(400)
    expect((await assign(anna, 10_000)).status).toBe(400)
    expect((await assign(anna, 3, { takeOver: 'yes' })).status).toBe(400)
    // Tables without a QR code (outside the range) can be served too.
    expect((await assign(anna, 40)).status).toBe(200)

    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/tickets/[id]/assign.post')).default
    const { event } = makeEvent({ method: 'POST' })
    event.context.auth = { staff: { staffId: anna, role: 'waiter', username: 'anna' } }
    event.context.params = { id: 't-1' }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('makes the waiter who orders at a free table responsible, but never steals', async () => {
    await order(anna, 7)
    expect(holders()).toEqual([{ table_no: 7, staff_id: anna }])
    await order(ben, 7)
    expect(holders()).toEqual([{ table_no: 7, staff_id: anna }])
    // Admins helping out and walk-ins claim nothing.
    await order(seeded.staffId, 8, 'admin')
    await order(ben, 9, 'waiter', 'walkin')
    expect(holders().map((h) => h.table_no)).toEqual([7])
  })

  it('delivers responsibility with the tickets poll and the detail', async () => {
    await order(anna, 7)
    await assign(ben, 2)
    const walk = await order(ben, 0, 'waiter', 'walkin')
    const res = await list()
    expect(res.tableRange).toEqual({ from: 1, to: 12 })
    expect(res.assignments.map((a) => [a.tableNo, a.username])).toEqual([[2, 'ben'], [7, 'anna']])
    const byKey = new Map(res.tickets.map((t) => [t.ticketKey, t]))
    expect(byKey.get('t-7')!.assignee).toEqual({ staffId: anna, username: 'anna' })
    // A walk-in belongs to whoever took it.
    expect(byKey.get(`w-${walk.body.orderId}`)!.assignee).toEqual({ staffId: ben, username: 'ben' })

    const detail = await call<Summary>(`${API}/tickets/[id].get`, { staff: as(anna), params: { id: 't-7' } })
    expect(detail.body.assignee).toEqual({ staffId: anna, username: 'anna' })
    await release(anna, 7)
    const after = await call<Summary>(`${API}/tickets/[id].get`, { staff: as(anna), params: { id: 't-7' } })
    expect(after.body.assignee).toBeNull()
    const walkDetail = await call<Summary>(`${API}/tickets/[id].get`, { staff: as(anna), params: { id: `w-${walk.body.orderId}` } })
    expect(walkDetail.body.assignee).toEqual({ staffId: ben, username: 'ben' })
  })

  it('frees the tables of a deactivated waiter or one moved to the kitchen', async () => {
    await assign(anna, 1)
    await assign(anna, 2)
    await assign(ben, 3)
    const patch = (id: string, body: unknown) => call(`${API}/admin/staff/[id].patch`, { method: 'PATCH', staff: as(seeded.staffId, 'admin'), params: { id }, body })
    expect((await patch(anna, { isActive: false })).status).toBe(200)
    expect(holders()).toEqual([{ table_no: 3, staff_id: ben }])
    const log = ctx.mem.public.many(`SELECT payload FROM audit_log WHERE action = 'staff_update'`) as Array<{ payload: Record<string, unknown> }>
    expect(log[0]!.payload.releasedTables).toBe(2)
    await patch(ben, { role: 'kitchen' })
    expect(holders()).toHaveLength(0)
  })

  it('shows who holds which table in the reports, also as CSV', async () => {
    await assign(anna, 5)
    await assign(ben, 1)
    const admin = as(seeded.staffId, 'admin')
    const report = await call<{ type: string; rows: Array<{ tableNo: number; username: string }> }>(`${API}/admin/events/[id]/reports.get`, {
      staff: admin, params: { id: seeded.eventId }, url: '/x?type=table_assignments',
    })
    expect(report.status).toBe(200)
    expect(report.body.rows.map((r) => [r.tableNo, r.username])).toEqual([[1, 'ben'], [5, 'anna']])
    const csv = await call<string>(`${API}/admin/events/[id]/reports.get`, {
      staff: admin, params: { id: seeded.eventId }, url: '/x?type=table_assignments&format=csv',
    })
    expect(csv.body).toContain('tableNo;username;staffId;assignedAt')
    expect(csv.body).toContain('5;anna;')
  })

  it('clears assignments when the rehearsal ends', async () => {
    await assign(anna, 5)
    const { resetTableState } = await import('../../server/lib/events')
    const { getDb } = await import('../../server/db/client')
    await resetTableState(getDb(), seeded.eventId)
    expect(holders()).toHaveLength(0)
  })
})
