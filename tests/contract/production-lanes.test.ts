import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

// One guest order with one item of the station at the table, `offset` seconds after now.
function order(tableNo: number, offset: number, station: 'kitchen' | 'bar' = 'kitchen'): string {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id, created_at)
     VALUES ('${seeded.eventId}', ${tableNo}, '${guestId}', now() + interval '${offset} seconds') RETURNING id`,
  ) as { id: string }).id
  const menuId = seeded.menuItemIds[0]!
  return (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${menuId}', 1, 100, '${station}') RETURNING id`,
  ) as { id: string }).id
}

const q = (v: string | null) => (v === null ? 'NULL' : `'${v}'`)

// Kitchen buzzer keys (columns kept from when one pair served both stations).
function buzzers(one: string | null, two: string | null) {
  ctx.mem.public.none(`UPDATE events SET buzzer_key = ${q(one)}, buzzer_key_2 = ${q(two)} WHERE id = '${seeded.eventId}'`)
}

function barBuzzers(one: string | null, two: string | null) {
  ctx.mem.public.none(`UPDATE events SET bar_buzzer_key = ${q(one)}, bar_buzzer_key_2 = ${q(two)} WHERE id = '${seeded.eventId}'`)
}

function finish(itemId: string) {
  ctx.mem.public.none(`UPDATE order_items SET production_status = 'done' WHERE id = '${itemId}'`)
}

interface Polled { lanes: Array<{ lane: number; key: string; groupKey: string | null; assignedAt: string | null }>; items: Array<{ tableNo: number; productionStatus: string }> }

// Lane -> table it holds ("table:12:<order id>" -> 12).
const tables = (r: Polled) => r.lanes.map((l) => [l.lane, l.groupKey === null ? null : Number(l.groupKey.split(':')[1])])

// One display of the station polling; `staffId` tells displays apart.
async function poll(role: 'kitchen' | 'bar' = 'kitchen', staffId = seeded.staffId): Promise<Polled> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/production/queue.get')).default
  const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
  event.context.auth = { staff: { staffId, role, username: role } }
  return await handler(event) as never
}

describe('production lanes (buzzers)', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('has no lanes without a buzzer key', async () => {
    order(1, 0)
    expect((await poll()).lanes).toEqual([])
    expect(ctx.mem.public.many('SELECT * FROM production_lanes')).toEqual([])
  })

  it('gives each lane the oldest free card and keeps it there until it is finished', async () => {
    const t12 = order(12, 0)
    order(7, 10)
    order(3, 20)
    buzzers('F9', 'F10')

    const first = await poll()
    expect(tables(first)).toEqual([[1, 12], [2, 7]])
    expect(first.lanes.map((l) => l.key)).toEqual(['F9', 'F10'])
    expect(first.lanes.every((l) => l.assignedAt !== null)).toBe(true)
    // Taken cards are "in preparation" for the guest, the waiting one is not.
    expect(first.items.map((i) => [i.tableNo, i.productionStatus])).toEqual([[12, 'in_progress'], [7, 'in_progress'], [3, 'pending']])

    // Polling again changes nothing; finishing lane 1 refills lane 1 only.
    expect((await poll()).lanes).toEqual(first.lanes)
    finish(t12)
    expect(tables(await poll())).toEqual([[1, 3], [2, 7]])
  })

  it('a card finished from the queue does not disturb the lanes', async () => {
    order(12, 0)
    order(7, 10)
    const t3 = order(3, 20)
    order(5, 30)
    buzzers('F9', 'F10')
    await poll()
    finish(t3)
    const after = await poll()
    expect(tables(after)).toEqual([[1, 12], [2, 7]])
    expect(after.items.map((i) => i.tableNo)).toEqual([12, 7, 5])
  })

  it('an empty lane waits; a removed buzzer frees its card', async () => {
    order(12, 0)
    buzzers('F9', 'F10')
    expect(tables(await poll())).toEqual([[1, 12], [2, null]])
    order(7, 10)
    expect(tables(await poll())).toEqual([[1, 12], [2, 7]])

    buzzers(null, 'F10')
    expect(tables(await poll())).toEqual([[2, 7]])
    buzzers(null, null)
    expect((await poll()).lanes).toEqual([])
    expect(ctx.mem.public.many('SELECT * FROM production_lanes')).toEqual([])
  })

  it('each station has its own keys; an empty key is no lane', async () => {
    order(12, 0)
    order(7, 10, 'bar')
    order(3, 20, 'bar')
    buzzers('F9', null)
    barBuzzers(null, 'F9')
    const kitchen = await poll('kitchen')
    expect(kitchen.lanes.map((l) => [l.lane, l.key])).toEqual([[1, 'F9']])
    expect(tables(kitchen)).toEqual([[1, 12]])
    const bar = await poll('bar')
    expect(bar.lanes.map((l) => [l.lane, l.key])).toEqual([[2, 'F9']])
    expect(tables(bar)).toEqual([[2, 7]])

    barBuzzers(null, null)
    expect((await poll('bar')).lanes).toEqual([])
    expect(tables(await poll('kitchen'))).toEqual([[1, 12]])
  })

  it('the migration gives the bar the keys both stations shared before', async () => {
    buzzers('F9', 'F10')
    barBuzzers(null, null)
    ctx.mem.public.none(readFileSync(resolve(import.meta.dirname, '../../server/db/migrations/0034_copy_buzzer_keys_to_bar.sql'), 'utf8'))
    order(12, 0)
    order(7, 10, 'bar')
    expect((await poll('kitchen')).lanes.map((l) => l.key)).toEqual(['F9', 'F10'])
    expect((await poll('bar')).lanes.map((l) => l.key)).toEqual(['F9', 'F10'])
  })

  it('every display of a station shows the same lanes', async () => {
    const t12 = order(12, 0)
    order(7, 10)
    order(3, 20)
    buzzers('F9', 'F10')
    const other = crypto.randomUUID()
    const first = await poll('kitchen')
    expect((await poll('kitchen', other)).lanes).toEqual(first.lanes)
    finish(t12)
    const refilled = await poll('kitchen', other)
    expect(tables(refilled)).toEqual([[1, 3], [2, 7]])
    expect((await poll('kitchen')).lanes).toEqual(refilled.lanes)
  })

  it('only an order within a minute of the first joins its card; a later round is a card of its own', async () => {
    order(12, 0)
    const soon = order(12, 50)
    order(7, 70)
    const late = order(12, 120)
    buzzers('F9', 'F10')
    const r = await poll()
    const cards = r.lanes.map((l) => l.groupKey)
    // Lane 1: table 12 with both items of the first minute; lane 2: table 7.
    expect(tables(r)).toEqual([[1, 12], [2, 7]])
    expect(cards[0]).not.toBe(`table:12:${late}`)
    const statuses = Object.fromEntries((ctx.mem.public.many(`SELECT id, production_status FROM order_items`) as Array<{ id: string; production_status: string }>).map((i) => [i.id, i.production_status]))
    expect(statuses[soon]).toBe('in_progress')
    // The later round of table 12 waits as its own card.
    expect(statuses[late]).toBe('pending')
    expect(r.items.filter((i) => i.tableNo === 12)).toHaveLength(3)
  })

  it('the admin cannot give both buzzers of a station the same key; the other station may use it', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const patch = (await import('../../server/api/admin/events/[id]/branding.patch')).default
    const req = (body: unknown) => {
      ctx.setBody(body)
      const csrf = 'a'.repeat(64)
      const { event } = makeEvent({ method: 'PATCH', cookies: { csrf }, headers: { 'x-csrf-token': csrf } })
      event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
      event.context.params = { id: seeded.eventId }
      return patch(event)
    }
    const stored = () => ctx.mem.public.one(`SELECT buzzer_key, buzzer_key_2, bar_buzzer_key, bar_buzzer_key_2 FROM events WHERE id = '${seeded.eventId}'`)
    await req({ kitchenBuzzerKey: 'F9' })
    await expect(req({ kitchenBuzzerKey2: 'F9' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(req({ kitchenBuzzerKey: 'F10', kitchenBuzzerKey2: 'F10' })).rejects.toMatchObject({ statusCode: 400 })
    await req({ kitchenBuzzerKey2: 'F10' })
    await req({ barBuzzerKey: 'F10', barBuzzerKey2: 'F9' })
    await expect(req({ barBuzzerKey: 'F9' })).rejects.toMatchObject({ statusCode: 400 })
    expect(stored()).toEqual({ buzzer_key: 'F9', buzzer_key_2: 'F10', bar_buzzer_key: 'F10', bar_buzzer_key_2: 'F9' })
  })
})
