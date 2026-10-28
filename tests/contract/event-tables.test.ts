import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

async function putTables(body: unknown, role: 'admin' | 'waiter' = 'admin') {
  const handler = (await import('../../server/api/admin/events/[id]/tables.put')).default
  ctx.setBody(body)
  const { event } = makeEvent({ method: 'PUT', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'a' } }
  event.context.params = { id: seeded.eventId }
  return await handler(event) as { tableRangeFrom: number; tableRangeTo: number }
}

// One unpaid line on the table.
function openBill(tableNo: number, paymentStatus = 'unpaid') {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  ctx.mem.public.none(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, payment_status)
     VALUES ('${orderId}', '${seeded.menuItemIds[0]}', 1, 450, 'kitchen', '${paymentStatus}')`,
  )
}

const tableNos = (t: string) =>
  (ctx.mem.public.many(`SELECT table_no FROM ${t} ORDER BY table_no`) as Array<{ table_no: number }>).map((r) => r.table_no)

describe('PUT /api/admin/events/:id/tables', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 10 })
  })

  it('adds tables to a running event and logs the change', async () => {
    openBill(10)
    expect(await putTables({ tableRangeFrom: 1, tableRangeTo: 11 })).toMatchObject({ tableRangeFrom: 1, tableRangeTo: 11 })
    const audit = ctx.mem.public.one(`SELECT action, payload FROM audit_log`) as { action: string; payload: unknown }
    expect(audit).toEqual({ action: 'event_update', payload: { tableRangeTo: { from: 10, to: 11 } } })
  })

  it('removes tables without open bills, together with their assignments and checks', async () => {
    openBill(9, 'paid')
    for (const n of [5, 9]) {
      ctx.mem.public.none(`INSERT INTO table_assignments (event_id, table_no, staff_id) VALUES ('${seeded.eventId}', ${n}, '${seeded.staffId}')`)
      ctx.mem.public.none(`INSERT INTO table_checks (event_id, table_no, staff_id) VALUES ('${seeded.eventId}', ${n}, '${seeded.staffId}')`)
    }
    expect(await putTables({ tableRangeFrom: 1, tableRangeTo: 8 })).toMatchObject({ tableRangeTo: 8 })
    expect(tableNos('table_assignments')).toEqual([5])
    expect(tableNos('table_checks')).toEqual([5])
  })

  it('refuses to remove a table with an open bill', async () => {
    openBill(9)
    await expect(putTables({ tableRangeFrom: 2, tableRangeTo: 8 })).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'TABLES_OPEN', details: { tableNos: [9] } },
    })
    const row = ctx.mem.public.one(`SELECT table_range_to FROM events`) as { table_range_to: number }
    expect(row.table_range_to).toBe(10)
  })

  it('validates the range and requires an admin', async () => {
    await expect(putTables({ tableRangeFrom: 5, tableRangeTo: 4 })).rejects.toMatchObject({ statusCode: 400 })
    await expect(putTables({ tableRangeFrom: 0, tableRangeTo: 4 })).rejects.toMatchObject({ statusCode: 400 })
    await expect(putTables({ tableRangeFrom: 1, tableRangeTo: 12 }, 'waiter')).rejects.toMatchObject({ statusCode: 403 })
  })
})
