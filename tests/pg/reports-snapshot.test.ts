import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { installCommonMocks, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { freshDatabase, testDatabaseUrl, type RealPg } from '../setup/real-pg'
import { call } from '../setup/call'
import type { ReportsAll } from '../../server/lib/contracts/reports'

const url = testDatabaseUrl()

let real: RealPg
let ctx: RouteTestCtx
let eventId: string
let staffId: string
let menuItemId: string

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  return (await real.db.execute(query)).rows[0] as T
}

// One paid item of `cents` with its payment, committed on its own connection.
async function pay(cents: number) {
  const order = await one<{ id: string }>(sql`
    INSERT INTO orders (event_id, table_no, kind, created_by_staff)
    VALUES (${eventId}, 1, 'staff_table', ${staffId}) RETURNING id`)
  const item = await one<{ id: string }>(sql`
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, payment_status, category)
    VALUES (${order.id}, ${menuItemId}, 1, ${cents}, 'bar', 'paid', 'drink') RETURNING id`)
  const payment = await one<{ id: string }>(sql`
    INSERT INTO payments (event_id, staff_id, total_cents) VALUES (${eventId}, ${staffId}, ${cents}) RETURNING id`)
  await real.db.execute(sql`INSERT INTO payment_items (payment_id, order_item_id) VALUES (${payment.id}, ${item.id})`)
}

const sum = (rows: Array<{ totalCents: number }>) => rows.reduce((n, r) => n + r.totalCents, 0)

// pg-mem ignores the isolation level; only a real server keeps the tables in step.
describe.skipIf(!url)('real Postgres: bundled reports snapshot', () => {
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
      VALUES ('PG Fest', 'PG4', 1, 20, true) RETURNING id`)).id
    staffId = (await one<{ id: string }>(sql`
      INSERT INTO staff (username, password_hash, role) VALUES ('a', 'h', 'admin') RETURNING id`)).id
    menuItemId = (await one<{ id: string }>(sql`
      INSERT INTO menu_items (event_id, name_de, name_en, price_cents, category, station)
      VALUES (${eventId}, 'Bier', 'Beer', 500, 'drink', 'bar') RETURNING id`)).id
    await pay(500)
  })

  afterAll(async () => {
    vi.doUnmock('../../server/lib/reports-load')
    await real?.pool.end()
  })

  it('shows payments_by_staff and revenue_by_category from the same snapshot', async () => {
    // A payment commits right after the first report was read, before the fourth.
    let injected = false
    vi.doMock('../../server/lib/reports-load', async () => {
      const actual = await vi.importActual<typeof import('../../server/lib/reports-load')>('../../server/lib/reports-load')
      return {
        loadReportRows: async (...args: Parameters<typeof actual.loadReportRows>) => {
          const rows = await actual.loadReportRows(...args)
          if (args[1] === 'revenue_by_category' && !injected) {
            injected = true
            await pay(1000)
          }
          return rows
        },
      }
    })
    const admin = { staffId, role: 'admin' as const }
    const path = '../../server/api/admin/events/[id]/reports/all.get'
    const bundled = await call<ReportsAll>(path, { staff: admin, params: { id: eventId } })
    expect(injected).toBe(true)
    expect(bundled.status).toBe(200)
    expect(sum(bundled.body.reports.revenue_by_category)).toBe(500)
    expect(sum(bundled.body.reports.payments_by_staff)).toBe(500)

    // The next poll sees the committed payment in both tables.
    const next = await call<ReportsAll>(path, { staff: admin, params: { id: eventId } })
    expect(sum(next.body.reports.revenue_by_category)).toBe(1500)
    expect(sum(next.body.reports.payments_by_staff)).toBe(1500)
  })
})
