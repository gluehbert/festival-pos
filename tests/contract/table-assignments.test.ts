import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getCtx, installCommonMocks, makeCtx, setCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

describe('table assignments — contract', () => {
  beforeEach(async () => {
    setCtx(await makeCtx())
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(getCtx().mem, { tableRangeFrom: 2, tableRangeTo: 9 })
  })

  it('accepts only a boolean takeOver, defaulting to false', async () => {
    const { AssignTableSchema } = await import('../../server/lib/contracts/tables')
    expect(AssignTableSchema.parse({})).toEqual({ takeOver: false })
    expect(AssignTableSchema.parse({ takeOver: true })).toEqual({ takeOver: true })
    expect(() => AssignTableSchema.parse({ takeOver: 1 })).toThrow()
  })

  it('answers assign and release with the table and its assignee', async () => {
    const { AssignTableResponseSchema } = await import('../../server/lib/contracts/tables')
    const waiter = insertStaff('waiter', 'carla')
    const staff = { staffId: waiter, role: 'waiter' as const }
    const a = await call('../../server/api/tickets/[id]/assign.post', { method: 'POST', staff, params: { id: 't-4' }, body: {} })
    expect(AssignTableResponseSchema.parse(a.body)).toEqual({ tableNo: 4, assignee: { staffId: waiter, username: 'carla' } })
    const r = await call('../../server/api/tickets/[id]/assign.delete', { method: 'DELETE', staff, params: { id: 't-4' } })
    expect(AssignTableResponseSchema.parse(r.body)).toEqual({ tableNo: 4, assignee: null })
  })

  it('extends GET /api/tickets with assignments, table range and assignee', async () => {
    const { TicketsListSchema } = await import('../../server/lib/contracts/staff')
    const waiter = insertStaff('waiter', 'dora')
    const staff = { staffId: waiter, role: 'waiter' as const }
    await call('../../server/api/orders/index.post', {
      method: 'POST', staff, body: { tableNo: 3, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] },
    })
    const res = await call('../../server/api/tickets/index.get', { staff })
    const parsed = TicketsListSchema.parse(res.body)
    expect(parsed.tableRange).toEqual({ from: 2, to: 9 })
    expect(parsed.assignments).toEqual([{ tableNo: 3, staffId: waiter, username: 'dora', assignedAt: expect.any(String) }])
    expect(parsed.tickets[0]!.assignee).toEqual({ staffId: waiter, username: 'dora' })
  })

  it('offers table_assignments as a report type', async () => {
    const { ReportTypeEnum, ReportSchema } = await import('../../server/lib/contracts/reports')
    expect(ReportTypeEnum.options).toContain('table_assignments')
    expect(ReportSchema.parse({
      eventId: seeded.eventId,
      generatedAt: new Date().toISOString(),
      type: 'table_assignments',
      rows: [{ tableNo: 1, staffId: seeded.staffId, username: 'admin', assignedAt: new Date().toISOString() }],
    }).type).toBe('table_assignments')
  })
})
