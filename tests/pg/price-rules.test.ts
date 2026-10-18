import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { installCommonMocks, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { freshDatabase, testDatabaseUrl, type RealPg } from '../setup/real-pg'
import { call } from '../setup/call'
import type { Order } from '../../server/lib/contracts/guest'
import type { PriceRuleDto, PriceRulesList } from '../../server/lib/contracts/pricing'

const url = testDatabaseUrl()

let real: RealPg
let ctx: RouteTestCtx
let eventId: string
let adminId: string
let waiterId: string
let beer: string

async function one<T>(query: ReturnType<typeof sql>): Promise<T> {
  return (await real.db.execute(query)).rows[0] as T
}

// jsonb article lists, date columns and the order snapshot through the real driver.
describe.skipIf(!url)('real Postgres: price rules', () => {
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
      INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active, deposit_enabled)
      VALUES ('PG Fest', 'PG3', 1, 20, true, true) RETURNING id`)).id
    adminId = (await one<{ id: string }>(sql`INSERT INTO staff (username, password_hash, role) VALUES ('a', 'h', 'admin') RETURNING id`)).id
    waiterId = (await one<{ id: string }>(sql`INSERT INTO staff (username, password_hash, role) VALUES ('w', 'h', 'waiter') RETURNING id`)).id
    beer = (await one<{ id: string }>(sql`
      INSERT INTO menu_items (event_id, name_de, name_en, price_cents, deposit_cents, category, station)
      VALUES (${eventId}, 'Bier', 'Beer', 350, 200, 'drink', 'bar') RETURNING id`)).id
  })

  afterEach(() => vi.useRealTimers())

  afterAll(async () => {
    await real?.pool.end()
  })

  it('stores a rule and books its price at order time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-10T15:30:00Z')) // Fr 17:30 Berlin
    const admin = { staffId: adminId, role: 'admin' as const }
    const created = await call<PriceRuleDto>('../../server/api/admin/events/[id]/price-rules/index.post', {
      method: 'POST', staff: admin, params: { id: eventId },
      body: { name: 'Happy Hour', startTime: '17:00', endTime: '18:00', weekdays: [5], validFrom: '2026-07-10', validTo: '2026-07-11', menuItemIds: [beer], categories: ['food'], kind: 'percent', value: 15 },
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ weekdays: [5], validFrom: '2026-07-10', validTo: '2026-07-11', menuItemIds: [beer], categories: ['food'], runningUntil: '2026-07-10T16:00:00.000Z' })

    const list = await call<PriceRulesList>('../../server/api/admin/events/[id]/price-rules/index.get', { staff: admin, params: { id: eventId } })
    expect(list.body.preview).toEqual([expect.objectContaining({ menuItemId: beer, regularPriceCents: 350, priceCents: 298 })])

    const order = await call<Order>('../../server/api/orders/index.post', {
      method: 'POST', staff: { staffId: waiterId, role: 'waiter' },
      body: { tableNo: 2, mode: 'staff_table', items: [{ menuItemId: beer, quantity: 2 }] },
    })
    expect(order.status).toBe(201)
    // 350 − 15 % = 297.5 → 298; deposit untouched.
    expect(order.body.items[0]).toMatchObject({ unitPriceCents: 298, depositCents: 200, regularPriceCents: 350, priceRuleName: 'Happy Hour' })

    const audit = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_log WHERE action = 'price_rule_create'`)
    expect(audit.n).toBe(1)
  })
})
