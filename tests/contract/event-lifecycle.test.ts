import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

const EV = '../../server/api/admin/events/[id]'
let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let admin: { staffId: string; role: 'admin' }
let waiterId: string

const rows = <T>(q: string) => ctx.mem.public.many(q) as T[]
const count = (table: string) => (ctx.mem.public.one(`SELECT count(*)::int AS n FROM ${table}`) as { n: number }).n

// One order with one line at a table; returns the item id.
function addLine(tableNo: number, opts: { price?: number; qty?: number; status?: string; pay?: string; served?: boolean; trial?: boolean; voided?: boolean } = {}): string {
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, kind, created_by_staff, is_trial)
     VALUES ('${seeded.eventId}', ${tableNo}, 'staff_table', '${waiterId}', ${opts.trial ?? false}) RETURNING id`,
  ) as { id: string }).id
  return (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, production_status, payment_status, served_at, voided_at)
     VALUES ('${orderId}', '${seeded.menuItemIds[0]}', ${opts.qty ?? 1}, ${opts.price ?? 350}, 'kitchen',
             '${opts.voided ? 'cancelled' : (opts.status ?? 'pending')}', '${opts.pay ?? 'unpaid'}',
             ${opts.served ? 'now()' : 'NULL'}, ${opts.voided ? 'now()' : 'NULL'}) RETURNING id`,
  ) as { id: string }).id
}

function endCheck(id = seeded.eventId) {
  return call<{
    openTables: { count: number; totalCents: number; tableNos: number[] }
    openCashSessions: Array<{ username: string; openedAt: string }>
    undeliveredItems: number
  }>(`${EV}/end-check.get`, { staff: admin, params: { id } })
}
const end = (id = seeded.eventId, staff = admin) => call(`${EV}/end.post`, { method: 'POST', staff, params: { id } })
const activate = (id: string) => call(`${EV}/activate.post`, { method: 'POST', staff: admin, params: { id } })
const del = (id = seeded.eventId, staff = admin) => call(`${EV}`.replace('[id]', '[id].delete'), { method: 'DELETE', staff, params: { id } })

function otherEvent(opts: { active?: boolean; ended?: boolean } = {}): string {
  return (ctx.mem.public.one(
    `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active, activated_at, deactivated_at)
     VALUES ('Next festival', 'NEXT1', 1, 5, ${opts.active ?? false},
             ${opts.active || opts.ended ? 'now()' : 'NULL'}, ${opts.ended ? 'now()' : 'NULL'}) RETURNING id`,
  ) as { id: string }).id
}

describe('event end — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    admin = { staffId: seeded.staffId, role: 'admin' }
    waiterId = insertStaff('waiter', 'anna')
  })

  it('end-check is empty when nothing is open', async () => {
    addLine(1, { pay: 'paid', status: 'done', served: true })
    const res = await endCheck()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ openTables: { count: 0, totalCents: 0, tableNos: [] }, openCashSessions: [], undeliveredItems: 0 })
  })

  it('end-check lists open tables with amounts, open drawers and finished but undelivered items', async () => {
    addLine(3, { price: 400, qty: 2 }) // 8,00 € open
    addLine(3, { price: 350 })
    addLine(7, { price: 200, status: 'done' }) // finished, unpaid, not brought
    addLine(9, { pay: 'paid', status: 'done' }) // paid but not brought
    addLine(4, { pay: 'paid', status: 'done', served: true }) // all settled
    addLine(5, { voided: true }) // voided: not open
    addLine(6, { trial: true }) // rehearsal: ignored
    ctx.mem.public.none(`INSERT INTO cash_sessions (event_id, staff_id, opening_cents) VALUES ('${seeded.eventId}', '${waiterId}', 5000)`)
    const res = await endCheck()
    expect(res.body.openTables).toEqual({ count: 2, totalCents: 1150 + 200, tableNos: [3, 7] })
    expect(res.body.openCashSessions).toHaveLength(1)
    expect(res.body.openCashSessions[0]).toMatchObject({ username: 'anna' })
    expect(res.body.undeliveredItems).toBe(2)
  })

  it('end-check and end need an admin and a known event', async () => {
    const lead = { staffId: insertStaff('waiter'), role: 'waiter' as const }
    expect((await call(`${EV}/end-check.get`, { staff: lead, params: { id: seeded.eventId } })).status).toBe(403)
    expect((await end(seeded.eventId, lead as never)).status).toBe(403)
    expect((await endCheck('00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect((await end('00000000-0000-4000-8000-000000000000')).status).toBe(404)
  })

  it('end deactivates the event, drops payment locks and writes the check into the audit log', async () => {
    addLine(3, { price: 500 })
    ctx.mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at) VALUES ('${seeded.eventId}', 3, '${waiterId}', now() + interval '1 minute')`,
    )
    const res = await end()
    expect(res.status).toBe(200)
    const ev = rows<{ is_active: boolean; deactivated_at: unknown }>(`SELECT is_active, deactivated_at FROM events WHERE id = '${seeded.eventId}'`)[0]!
    expect(ev.is_active).toBe(false)
    expect(ev.deactivated_at).not.toBeNull()
    expect(count('payment_locks')).toBe(0)
    const audit = rows<{ action: string; target_id: string; payload: { openTables: { count: number; totalCents: number } } }>(
      `SELECT action, target_id, payload FROM audit_log WHERE action = 'event_end'`,
    )
    expect(audit).toHaveLength(1)
    expect(audit[0]!.target_id).toBe(seeded.eventId)
    expect(audit[0]!.payload.openTables).toMatchObject({ count: 1, totalCents: 500 })
  })

  it('end leaves open cash drawers open', async () => {
    ctx.mem.public.none(`INSERT INTO cash_sessions (event_id, staff_id, opening_cents) VALUES ('${seeded.eventId}', '${waiterId}', 5000)`)
    await end()
    expect(rows(`SELECT 1 FROM cash_sessions WHERE closed_at IS NULL`)).toHaveLength(1)
  })

  it('end on an event that is not live answers 409 and writes nothing', async () => {
    const draft = otherEvent()
    expect((await end(draft)).status).toBe(409)
    await end()
    const again = await end()
    expect(again.status).toBe(409)
    expect(rows(`SELECT 1 FROM audit_log WHERE action = 'event_end'`)).toHaveLength(1)
  })

  it('activate refuses while another event is live and names it', async () => {
    const next = otherEvent()
    const res = await activate(next)
    expect(res.status).toBe(409)
    expect(res.error).toMatchObject({ code: 'EVENT_STILL_ACTIVE' })
    expect(res.error?.message).toContain('Demo')
    expect(rows(`SELECT 1 FROM events WHERE id = '${next}' AND is_active`)).toHaveLength(0)
  })

  it('activate works after the live event was ended and reactivating the live event is harmless', async () => {
    const next = otherEvent()
    await end()
    expect((await activate(next)).status).toBe(200)
    expect(rows(`SELECT 1 FROM events WHERE id = '${next}' AND is_active`)).toHaveLength(1)
    expect((await activate(next)).status).toBe(200)
  })

  it('the event DTO carries the end date', async () => {
    await end()
    const list = await call<{ events: Array<{ id: string; deactivatedAt: string | null }> }>('../../server/api/admin/events/index.get', { staff: admin })
    expect(list.body.events.find((e) => e.id === seeded.eventId)?.deactivatedAt).toEqual(expect.any(String))
  })
})

describe('event delete — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    admin = { staffId: seeded.staffId, role: 'admin' }
    waiterId = insertStaff('waiter', 'anna')
  })

  function bookPayment(eventId = seeded.eventId): void {
    const itemId = addLine(2, { pay: 'paid', status: 'done' })
    const pid = (ctx.mem.public.one(
      `INSERT INTO payments (event_id, staff_id, total_cents) VALUES ('${eventId}', '${waiterId}', 350) RETURNING id`,
    ) as { id: string }).id
    ctx.mem.public.none(`INSERT INTO payment_items (payment_id, order_item_id) VALUES ('${pid}', '${itemId}')`)
  }

  it('refuses the live event and leaves everything in place', async () => {
    bookPayment()
    const res = await del()
    expect(res.status).toBe(409)
    expect(res.error).toMatchObject({ code: 'EVENT_ACTIVE' })
    expect(count('events')).toBe(1)
    expect(count('payments')).toBe(1)
    expect(count('orders')).toBe(1)
    expect(rows(`SELECT 1 FROM audit_log WHERE action = 'event_delete'`)).toHaveLength(0)
  })

  it('refuses a live event even if it has an end date left over from an earlier run', async () => {
    ctx.mem.public.none(`UPDATE events SET deactivated_at = now() WHERE id = '${seeded.eventId}'`)
    expect((await del()).status).toBe(409)
    expect(count('events')).toBe(1)
  })

  it('refuses an event that never ran', async () => {
    const draft = otherEvent()
    const res = await del(draft)
    expect(res.status).toBe(409)
    expect(res.error).toMatchObject({ code: 'EVENT_NOT_ENDED' })
    expect(count('events')).toBe(2)
  })

  it('needs an admin and a known event, and the live event survives a refused delete', async () => {
    await call(`${EV}/end.post`, { method: 'POST', staff: admin, params: { id: seeded.eventId } })
    const waiter = { staffId: waiterId, role: 'waiter' as const }
    expect((await del(seeded.eventId, waiter as never)).status).toBe(403)
    expect((await del('00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect(count('events')).toBe(1)
  })

  it('deletes an ended event with orders, payments, drawers and helper accounts, and audits it', async () => {
    const other = otherEvent({ ended: true })
    bookPayment()
    ctx.mem.public.none(`INSERT INTO cash_sessions (event_id, staff_id, opening_cents) VALUES ('${seeded.eventId}', '${waiterId}', 5000)`)
    ctx.mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at) VALUES ('${seeded.eventId}', 2, '${waiterId}', now() + interval '1 minute')`,
    )
    ctx.mem.public.none(`INSERT INTO staff (username, pin_hash, role, event_id) VALUES ('helfer', NULL, 'waiter', '${seeded.eventId}')`)
    ctx.mem.public.none(`UPDATE staff SET password_hash = NULL, pin_hash = NULL WHERE username = 'helfer'`)
    await call(`${EV}/end.post`, { method: 'POST', staff: admin, params: { id: seeded.eventId } })

    const res = await del()
    expect(res.status).toBe(200)
    for (const t of ['orders', 'order_items', 'payments', 'payment_items', 'payment_locks', 'cash_sessions', 'menu_items']) {
      expect(count(t)).toBe(0)
    }
    expect(rows(`SELECT id FROM events`)).toEqual([{ id: other }])
    // Permanent accounts stay, the helper joined for this event goes.
    expect(rows<{ username: string }>(`SELECT username FROM staff ORDER BY username`).map((s) => s.username)).toEqual(['admin', 'anna'])
    const audit = rows<{ target_id: string; staff_id: string; payload: Record<string, unknown> }>(
      `SELECT target_id, staff_id, payload FROM audit_log WHERE action = 'event_delete'`,
    )
    expect(audit).toHaveLength(1)
    expect(audit[0]!.target_id).toBe(seeded.eventId)
    expect(audit[0]!.staff_id).toBe(seeded.staffId)
    expect(audit[0]!.payload).toMatchObject({ name: 'Demo', orders: 1, payments: 1 })
    // The audit trail of the event itself (e.g. event_end) survives.
    expect(rows(`SELECT 1 FROM audit_log WHERE action = 'event_end'`)).toHaveLength(1)
  })

  it('does not touch another event', async () => {
    const other = otherEvent({ ended: true })
    ctx.mem.public.none(`INSERT INTO menu_items (event_id, name_de, name_en, price_cents, category, station) VALUES ('${other}', 'X', 'X', 100, 'food', 'kitchen')`)
    await call(`${EV}/end.post`, { method: 'POST', staff: admin, params: { id: seeded.eventId } })
    await del()
    expect(rows(`SELECT 1 FROM menu_items WHERE event_id = '${other}'`)).toHaveLength(1)
  })
})
