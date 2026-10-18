import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff, type Role } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let lead: string
let anna: string
let ben: string

const API = '../../server/api'
const as = (staffId: string, role: Role) => ({ staffId, role })
const assign = (actor: string, role: Role, tableNo: number, body: unknown) =>
  call<{ tableNo: number; assignee: { staffId: string; username: string } | null }>(`${API}/tickets/[id]/assign.post`, {
    method: 'POST', staff: as(actor, role), params: { id: `t-${tableNo}` }, body,
  })
const release = (actor: string, role: Role, tableNo: number) =>
  call(`${API}/tickets/[id]/assign.delete`, { method: 'DELETE', staff: as(actor, role), params: { id: `t-${tableNo}` } })
const team = (actor: string, role: Role) => call<{ team: Array<{ staffId: string; username: string }> }>(`${API}/tickets/team.get`, { staff: as(actor, role) })
const holders = () => ctx.mem.public.many(`SELECT table_no, staff_id FROM table_assignments ORDER BY table_no`) as Array<{ table_no: number; staff_id: string }>
const audits = (action: string) => ctx.mem.public.many(`SELECT * FROM audit_log WHERE action = '${action}'`) as Array<{ staff_id: string; payload: Record<string, unknown> }>

function insertHelper(username: string, eventId: string, role: Role = 'waiter', active = true): string {
  return (ctx.mem.public.one(
    `INSERT INTO staff (username, role, event_id, is_active) VALUES ('${username}', '${role}', '${eventId}', ${active}) RETURNING id`,
  ) as { id: string }).id
}

describe('Schichtleitung — handing out tables', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 12 })
    lead = insertStaff('lead', 'lena')
    anna = insertStaff('waiter', 'anna')
    ben = insertHelper('ben', seeded.eventId)
  })

  it('lists the active waiters and leads of this event, club and joined alike', async () => {
    insertStaff('kitchen', 'koch')
    insertHelper('gone', seeded.eventId, 'waiter', false)
    const res = await team(lead, 'lead')
    expect(res.status).toBe(200)
    expect(res.body.team.map((m) => m.username)).toEqual(['anna', 'ben', 'lena'])
    expect((await team(seeded.staffId, 'admin')).status).toBe(200)
    expect((await team(anna, 'waiter')).status).toBe(403)
  })

  it('hands tables to a person without asking, also away from someone else', async () => {
    const r = await assign(lead, 'lead', 3, { staffId: anna })
    expect(r.status).toBe(200)
    expect(r.body.assignee).toEqual({ staffId: anna, username: 'anna' })
    expect((await assign(lead, 'lead', 3, { staffId: ben })).status).toBe(200)
    expect(holders()).toEqual([{ table_no: 3, staff_id: ben }])
    // The audit names the lead who moved the table.
    expect(audits('table_takeover')[0]).toMatchObject({ staff_id: lead, payload: { tableNo: 3, staffId: ben, previousStaffId: anna } })
  })

  it('frees anyone\'s table', async () => {
    await assign(lead, 'lead', 4, { staffId: anna })
    expect((await release(lead, 'lead', 4)).status).toBe(200)
    expect(holders()).toHaveLength(0)
  })

  it('lets waiters assign only themselves', async () => {
    expect((await assign(anna, 'waiter', 5, { staffId: ben })).status).toBe(403)
    expect((await assign(anna, 'waiter', 5, { staffId: anna })).status).toBe(200)
    expect(holders()).toEqual([{ table_no: 5, staff_id: anna }])
  })

  it('refuses tables for kitchen staff, inactive people and unknown ids', async () => {
    const koch = insertStaff('kitchen', 'koch')
    const gone = insertHelper('gone', seeded.eventId, 'waiter', false)
    for (const staffId of [koch, gone, seeded.staffId, '00000000-0000-4000-8000-000000000000']) {
      expect((await assign(lead, 'lead', 6, { staffId })).status).toBe(400)
    }
    expect((await assign(lead, 'lead', 6, { staffId: 'nope' })).status).toBe(400)
    expect(holders()).toHaveLength(0)
  })

  it('serves like a waiter: ordering at a free table makes the lead responsible', async () => {
    const res = await call(`${API}/orders/index.post`, {
      method: 'POST', staff: as(lead, 'lead'), body: { tableNo: 7, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] },
    })
    expect(res.status).toBe(201)
    expect(holders()).toEqual([{ table_no: 7, staff_id: lead }])
  })
})
