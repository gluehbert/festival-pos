import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let eventId: string
let ids: string[]

// One order with the given lines; minutesAgo orders ties by recency.
function order(tableNo: number, kind: 'guest' | 'staff_table' | 'walkin', lines: Array<[number, number]>, opts: { minutesAgo?: number; cancelled?: boolean } = {}) {
  const staffId = (ctx.mem.public.one(`SELECT id FROM staff LIMIT 1`) as { id: string }).id
  const guestId = kind === 'guest'
    ? (ctx.mem.public.one(
        `INSERT INTO guest_sessions (event_id, table_no, expires_at) VALUES ('${eventId}', ${tableNo}, now() + interval '1 day') RETURNING id`,
      ) as { id: string }).id
    : null
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, kind, guest_session_id, created_by_staff, created_at)
     VALUES ('${eventId}', ${tableNo}, '${kind}', ${guestId ? `'${guestId}'` : 'NULL'}, ${guestId ? 'NULL' : `'${staffId}'`},
             now() - interval '${opts.minutesAgo ?? 0} minutes') RETURNING id`,
  ) as { id: string }).id
  for (const [idx, qty] of lines) {
    ctx.mem.public.none(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, production_status)
       VALUES ('${orderId}', '${ids[idx]}', ${qty}, 100, 'bar', '${opts.cancelled ? 'cancelled' : 'pending'}')`,
    )
  }
}

async function call(opts: { table?: string; staff?: boolean; guestTable?: number } = {}) {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/menu/popular.get')).default
  const { event } = makeEvent({ method: 'GET', url: opts.table ? `/api/menu/popular?table=${opts.table}` : '/api/menu/popular' })
  event.context.auth = opts.staff ? { staff: { staffId: 'x', role: 'waiter', username: 'w' } as never } : {}
  if (opts.guestTable) event.context.guest = { sessionId: 's', eventId, tableNo: opts.guestTable } as never
  return await handler(event) as { tableNo: number | null; table: string[]; event: string[] }
}

describe('GET /api/menu/popular', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    const seeded = seedEvent(ctx.mem, {
      items: [
        { nameDe: 'Pils', nameEn: 'Pils', priceCents: 400, category: 'Getränke', station: 'bar' },
        { nameDe: 'Wein', nameEn: 'Wine', priceCents: 500, category: 'Getränke', station: 'bar' },
        { nameDe: 'Cola', nameEn: 'Coke', priceCents: 300, category: 'Getränke', station: 'bar' },
        { nameDe: 'Wurst', nameEn: 'Sausage', priceCents: 450, category: 'Essen', station: 'kitchen' },
        { nameDe: 'Alt', nameEn: 'Old', priceCents: 100, category: 'Essen', station: 'kitchen', isAvailable: false },
      ],
    })
    eventId = seeded.eventId
    ids = seeded.menuItemIds
  })

  it('ranks the table first, then event best sellers without duplicates', async () => {
    order(5, 'staff_table', [[1, 2]])
    order(5, 'guest', [[3, 1]], { minutesAgo: 1 })
    order(7, 'guest', [[0, 10], [2, 4]])
    order(5, 'walkin', [[2, 9]]) // counter sale, not the table's
    const res = await call({ table: '5', staff: true })
    expect(res.tableNo).toBe(5)
    expect(res.table).toEqual([ids[1], ids[3]])
    expect(res.event).toEqual([ids[2], ids[0]])
  })

  it('ignores cancelled and unavailable items', async () => {
    order(5, 'guest', [[0, 3]], { cancelled: true })
    order(5, 'guest', [[4, 3]])
    const res = await call({ table: '5', staff: true })
    expect(res.table).toEqual([])
    expect(res.event).toEqual([])
  })

  it('gives guests their own table and ignores a table parameter', async () => {
    order(5, 'guest', [[1, 1]])
    order(7, 'guest', [[0, 1]])
    const res = await call({ table: '7', guestTable: 5 })
    expect(res.tableNo).toBe(5)
    expect(res.table).toEqual([ids[1]])
  })

  it('returns only best sellers without staff or guest session', async () => {
    order(5, 'guest', [[1, 1]])
    const res = await call({ table: '5' })
    expect(res.tableNo).toBeNull()
    expect(res.table).toEqual([])
    expect(res.event).toEqual([ids[1]])
  })

  it('rejects an invalid table number from staff', async () => {
    await expect(call({ table: 'abc', staff: true })).rejects.toThrow(/Invalid table/)
  })
})
