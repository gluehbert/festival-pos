import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { installCommonMocks, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { freshDatabase, testDatabaseUrl, type RealPg } from '../setup/real-pg'
import { makeEvent } from '../setup/h3-event'

const url = testDatabaseUrl()
const CSRF = 'a'.repeat(64)

let real: RealPg
let ctx: RouteTestCtx
let eventId: string
let waiterId: string
let cake: string
let coffee: string

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  const res = await real.db.execute(query)
  return res.rows[0] as T
}

async function staffOrder(items: Array<{ menuItemId: string; quantity: number }>): Promise<number> {
  const handler = (await import('../../server/api/orders/index.post')).default
  const e = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  e.event.context.auth = { staff: { staffId: waiterId, role: 'waiter', username: 'w' } }
  ctx.setBody({ tableNo: 2, mode: 'staff_table', items })
  try {
    await handler(e.event)
    return e.event.node.res.statusCode
  }
  catch (err) {
    return (err as { statusCode: number }).statusCode
  }
}

describe.skipIf(!url)('real Postgres: stock under parallel orders', () => {
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
    eventId = (await one<{ id: string }>(sql`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
      VALUES ('PG Fest', 'PG2', 1, 20, true) RETURNING id`)).id
    waiterId = (await one<{ id: string }>(sql`
      INSERT INTO staff (username, password_hash, role) VALUES ('w', 'h', 'waiter') RETURNING id`)).id
    const rows = await real.db.execute(sql`
      INSERT INTO menu_items (event_id, name_de, name_en, price_cents, category, station, stock)
      VALUES (${eventId}, 'Kuchen', 'Cake', 250, 'food', 'kitchen', 3),
             (${eventId}, 'Kaffee', 'Coffee', 200, 'drink', 'bar', 10)
      RETURNING id`)
    ;[cake, coffee] = rows.rows.map((r) => (r as { id: string }).id) as [string, string]
  })

  afterAll(async () => {
    await real?.pool.end()
  })

  it('sells exactly the stock when ten guests order the last pieces at once', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => staffOrder([{ menuItemId: cake, quantity: 1 }])))
    expect(results.filter((s) => s === 201)).toHaveLength(3)
    expect(results.filter((s) => s !== 201).every((s) => s === 409 || s === 400)).toBe(true)
    const item = await one<{ stock: number; is_available: boolean }>(sql`SELECT stock, is_available FROM menu_items WHERE id = ${cake}`)
    expect(item).toEqual({ stock: 0, is_available: false })
    const sold = await one<{ n: number }>(sql`SELECT COALESCE(SUM(quantity), 0)::int AS n FROM order_items WHERE menu_item_id = ${cake}`)
    expect(sold.n).toBe(3)
  })

  it('rolls back the whole order, other articles included, when one is short', async () => {
    await real.db.execute(sql`UPDATE menu_items SET stock = 1, is_available = true WHERE id = ${cake}`)
    const status = await staffOrder([{ menuItemId: coffee, quantity: 4 }, { menuItemId: cake, quantity: 2 }])
    expect(status).toBe(409)
    const left = await one<{ stock: number }>(sql`SELECT stock FROM menu_items WHERE id = ${coffee}`)
    expect(left.stock).toBe(10)
  })
})
