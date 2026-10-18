import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { installCommonMocks, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { freshDatabase, testDatabaseUrl, type RealPg } from '../setup/real-pg'
import { makeEvent } from '../setup/h3-event'

const url = testDatabaseUrl()
const CSRF = 'a'.repeat(64)

let real: RealPg
let ctx: RouteTestCtx
let adminId: string

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return (await real.db.execute(query)).rows as T[]
}
const one = async <T>(query: ReturnType<typeof sql>) => (await rows<T>(query))[0]!
const countOf = async (table: string) => (await one<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM ${table}`))).n

async function adminCall(path: string, method: string, id: string): Promise<number> {
  const handler = (await import(/* @vite-ignore */ path)).default
  const e = makeEvent({ method, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  e.event.context.auth = { staff: { staffId: adminId, role: 'admin', username: 'admin' } }
  e.event.context.params = { id }
  ctx.setBody(undefined)
  try {
    await handler(e.event)
    return e.event.node.res.statusCode
  }
  catch (err) {
    return (err as { statusCode: number }).statusCode
  }
}

// A full festival: menu, orders, payments, a refund, a deposit return, drawers
// and locks, all tied to waiters and helper accounts without ON DELETE CASCADE.
async function seedFest(name: string, pin: string, ended: boolean): Promise<{ eventId: string; helperId: string }> {
  const ev = await one<{ id: string }>(sql`
    INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active, activated_at, deactivated_at)
    VALUES (${name}, ${pin}, 1, 10, ${!ended}, now(), ${ended ? sql`now()` : null}) RETURNING id`)
  const helper = await one<{ id: string }>(sql`
    INSERT INTO staff (username, role, event_id) VALUES (${`helfer-${pin}`}, 'waiter', ${ev.id}) RETURNING id`)
  const menu = await one<{ id: string }>(sql`
    INSERT INTO menu_items (event_id, name_de, name_en, price_cents, category, station)
    VALUES (${ev.id}, 'Bier', 'Beer', 400, 'drink', 'bar') RETURNING id`)
  const order = await one<{ id: string }>(sql`
    INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES (${ev.id}, 2, 'staff_table', ${helper.id}) RETURNING id`)
  const item = await one<{ id: string }>(sql`
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, payment_status, production_status)
    VALUES (${order.id}, ${menu.id}, 1, 400, 'bar', 'paid', 'done') RETURNING id`)
  const pay = await one<{ id: string }>(sql`
    INSERT INTO payments (event_id, staff_id, total_cents) VALUES (${ev.id}, ${helper.id}, 400) RETURNING id`)
  await real.db.execute(sql`INSERT INTO payment_items (payment_id, order_item_id) VALUES (${pay.id}, ${item.id})`)
  await real.db.execute(sql`
    INSERT INTO refunds (event_id, order_item_id, payment_id, staff_id, amount_cents, reason)
    VALUES (${ev.id}, ${item.id}, ${pay.id}, ${helper.id}, 400, 'x')`)
  await real.db.execute(sql`
    INSERT INTO deposit_returns (event_id, staff_id, unit_cents, quantity, amount_cents) VALUES (${ev.id}, ${helper.id}, 200, 1, -200)`)
  await real.db.execute(sql`INSERT INTO cash_sessions (event_id, staff_id, opening_cents) VALUES (${ev.id}, ${helper.id}, 5000)`)
  await real.db.execute(sql`
    INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at) VALUES (${ev.id}, 2, ${helper.id}, now() + interval '1 minute')`)
  await real.db.execute(sql`INSERT INTO table_assignments (event_id, table_no, staff_id) VALUES (${ev.id}, 2, ${helper.id})`)
  return { eventId: ev.id, helperId: helper.id }
}

describe.skipIf(!url)('real Postgres: deleting an event', () => {
  beforeAll(async () => {
    await installCommonMocks()
    real = await freshDatabase(url!)
    ctx = {
      mem: undefined as never,
      db: real.db,
      body: undefined,
      setBody(b) { ctx.body = b },
      setGuest(g) { ctx.guest = g },
    }
    setCtx(ctx)
    adminId = (await one<{ id: string }>(sql`
      INSERT INTO staff (username, password_hash, role) VALUES ('admin', 'h', 'admin') RETURNING id`)).id
  })

  afterAll(async () => {
    await real?.pool.end()
  })

  it('a bare DELETE on the event is blocked by references without cascade', async () => {
    const { eventId } = await seedFest('Old festival', 'OLD1', true)
    await expect(real.db.execute(sql`DELETE FROM events WHERE id = ${eventId}`)).rejects.toThrow()
    expect(await countOf('events')).toBe(1)
  })

  it('the endpoint deletes the whole event and leaves other events alone', async () => {
    const keep = await seedFest('New festival', 'NEW1', true)
    const old = await one<{ id: string }>(sql`SELECT id FROM events WHERE name = 'Old festival'`)
    expect(await adminCall('../../server/api/admin/events/[id].delete', 'DELETE', old.id)).toBe(200)

    expect(await rows(sql`SELECT 1 FROM events WHERE id = ${old.id}`)).toHaveLength(0)
    expect(await countOf('staff WHERE event_id IS NOT NULL')).toBe(1)
    // One row per table is left: the other event's.
    for (const t of ['orders', 'order_items', 'payments', 'payment_items', 'refunds', 'deposit_returns', 'cash_sessions', 'payment_locks', 'table_assignments', 'menu_items']) {
      expect(await countOf(t), t).toBe(1)
    }
    expect(await one(sql`SELECT count(*)::int AS n FROM payments WHERE event_id = ${keep.eventId}`)).toEqual({ n: 1 })
    const audit = await one<{ payload: { orders: number; payments: number } }>(sql`SELECT payload FROM audit_log WHERE action = 'event_delete'`)
    expect(audit.payload).toMatchObject({ name: 'Old festival', orders: 1, payments: 1 })
  })

  it('refuses the live event on the real database', async () => {
    const { eventId } = await seedFest('Live festival', 'LIVE1', false)
    expect(await adminCall('../../server/api/admin/events/[id].delete', 'DELETE', eventId)).toBe(409)
    expect(await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM payments WHERE event_id = ${eventId}`)).toEqual({ n: 1 })
  })
})
