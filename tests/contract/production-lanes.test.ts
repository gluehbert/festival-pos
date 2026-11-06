import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

// One guest order with one kitchen item (menu 0) at the table, `offset` seconds after now.
function order(tableNo: number, offset: number): string {
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
     VALUES ('${orderId}', '${menuId}', 1, 100, 'kitchen') RETURNING id`,
  ) as { id: string }).id
}

// The station's buzzers, lane 1 first.
function buzzers(...keys: string[]) {
  ctx.mem.public.none(`DELETE FROM station_buzzers WHERE event_id = '${seeded.eventId}' AND station = 'kitchen'`)
  keys.forEach((key, i) => ctx.mem.public.none(
    `INSERT INTO station_buzzers (event_id, station, lane, key) VALUES ('${seeded.eventId}', 'kitchen', ${i + 1}, '${key}')`,
  ))
}

function finish(itemId: string) {
  ctx.mem.public.none(`UPDATE order_items SET production_status = 'done' WHERE id = '${itemId}'`)
}

interface Polled { lanes: Array<{ lane: number; key: string | null; color: string; paused: boolean; groupKey: string | null; assignedAt: string | null }>; items: Array<{ tableNo: number; productionStatus: string }> }

// Lane -> table it holds ("table:12:<order id>" -> 12).
const tables = (r: Polled) => r.lanes.map((l) => [l.lane, l.groupKey === null ? null : Number(l.groupKey.split(':')[1])])

async function poll(role: 'kitchen' | 'bar' = 'kitchen'): Promise<Polled> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/production/queue.get')).default
  const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'k' } }
  return await handler(event) as never
}

describe('production lanes (buzzers)', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('has one lane without a buzzer: the oldest card stands out', async () => {
    order(1, 0)
    order(2, 10)
    const r = await poll()
    expect(tables(r)).toEqual([[1, 1]])
    expect(r.lanes[0]!.key).toBeNull()
    expect(r.items.map((i) => [i.tableNo, i.productionStatus])).toEqual([[1, 'in_progress'], [2, 'pending']])
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

    // The buzzers after a removed one move up: lane 1 keeps its card, lane 2's goes back.
    buzzers('F10')
    const after = await poll()
    expect(tables(after)).toEqual([[1, 12]])
    expect(after.lanes[0]!.key).toBe('F10')
    expect(after.items.map((i) => [i.tableNo, i.productionStatus])).toEqual([[12, 'in_progress'], [7, 'in_progress']])
    buzzers()
    const none = await poll()
    expect(tables(none)).toEqual([[1, 12]])
    expect(none.lanes[0]!.key).toBeNull()
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

  it('fills up to four lanes, and the bar screen only has the bar\'s buzzers', async () => {
    for (const [n, table] of [10, 11, 12, 13, 14].entries()) order(table, n * 10)
    buzzers('1', '2', '3', '4')
    expect(tables(await poll())).toEqual([[1, 10], [2, 11], [3, 12], [4, 13]])
    expect((await poll('bar')).lanes).toEqual([{ lane: 1, key: null, color: 'green', paused: false, groupKey: null, assignedAt: null }])
    ctx.mem.public.none(`INSERT INTO station_buzzers (event_id, station, lane, key) VALUES ('${seeded.eventId}', 'bar', 1, '1')`)
    expect((await poll('bar')).lanes).toEqual([{ lane: 1, key: '1', color: 'green', paused: false, groupKey: null, assignedAt: null }])
    expect(() => ctx.mem.public.none(
      `INSERT INTO station_buzzers (event_id, station, lane, key) VALUES ('${seeded.eventId}', 'kitchen', 5, '5')`,
    )).toThrow()
  })
})

const CSRF = 'a'.repeat(64)

// The people at the station change their lanes (+/- in the display menu, pause).
async function setLanes(body: unknown, role: 'kitchen' | 'bar' | 'admin' = 'kitchen') {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/production/lanes.patch')).default
  ctx.setBody(body)
  const { event } = makeEvent({ method: 'PATCH', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'k' } }
  return await handler(event) as never
}

describe('production lanes without buzzers', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('splits the orders into the lanes set at the station, each lane one card', async () => {
    order(12, 0)
    order(7, 10)
    order(3, 20)
    const before = await poll() as Polled & { laneCount: number }
    expect(tables(before)).toEqual([[1, 12]])
    expect(before.laneCount).toBe(1)

    expect(await setLanes({ laneCount: 2 })).toEqual({ laneCount: 2, paused: [] })
    const r = await poll() as Polled & { laneCount: number }
    expect(r.laneCount).toBe(2)
    expect(tables(r)).toEqual([[1, 12], [2, 7]])
    expect(r.lanes.map((l) => l.key)).toEqual([null, null])
    // The bar keeps its own setting.
    expect((await poll('bar')).lanes).toHaveLength(1)

    // Back to one lane: lane 2's card goes back to the queue.
    await setLanes({ laneCount: 1 })
    expect(tables(await poll())).toEqual([[1, 12]])
  })

  it('a paused lane finishes its card, then takes no new one until it goes on', async () => {
    const t12 = order(12, 0)
    order(7, 10)
    order(3, 20)
    await setLanes({ laneCount: 2 })
    await poll()
    expect(await setLanes({ lane: 1, paused: true })).toEqual({ laneCount: 2, paused: [1] })
    const paused = await poll()
    expect(tables(paused)).toEqual([[1, 12], [2, 7]])
    expect(paused.lanes.map((l) => l.paused)).toEqual([true, false])

    finish(t12)
    expect(tables(await poll())).toEqual([[1, null], [2, 7]])
    await setLanes({ lane: 1, paused: false })
    expect(tables(await poll())).toEqual([[1, 3], [2, 7]])
  })

  it('fewer lanes send the last lane\'s card back to the queue and drop its pause', async () => {
    order(12, 0)
    order(7, 10)
    order(3, 20)
    await setLanes({ laneCount: 3 })
    expect(tables(await poll())).toEqual([[1, 12], [2, 7], [3, 3]])
    await setLanes({ lane: 3, paused: true })
    expect(await setLanes({ laneCount: 2 })).toEqual({ laneCount: 2, paused: [] })
    const r = await poll()
    expect(tables(r)).toEqual([[1, 12], [2, 7]])
    expect(r.items.map((i) => i.tableNo)).toEqual([12, 7, 3])
  })

  it('buzzers count as lanes; a new buzzer brings its lane back', async () => {
    order(12, 0)
    buzzers('F9', 'F10')
    expect((await poll()).lanes.map((l) => l.key)).toEqual(['F9', 'F10'])
    await setLanes({ laneCount: 3 })
    expect((await poll()).lanes.map((l) => l.key)).toEqual(['F9', 'F10', null])
    await setLanes({ laneCount: 1 })
    // One lane with a buzzer stays a lane: the buzzer still finishes it.
    expect((await poll()).lanes.map((l) => l.key)).toEqual(['F9'])

    const { makeEvent } = await import('../setup/h3-event')
    const put = (await import('../../server/api/admin/events/[id]/buzzers.put')).default
    ctx.setBody({ station: 'kitchen', keys: ['F9', 'F10'] })
    const { event } = makeEvent({ method: 'PUT', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
    event.context.params = { id: seeded.eventId }
    await put(event)
    expect((await poll()).lanes.map((l) => l.key)).toEqual(['F9', 'F10'])
  })

  it('a lane takes its buzzer\'s colour; lanes without one take free defaults', async () => {
    order(12, 0)
    ctx.mem.public.none(`INSERT INTO station_buzzers (event_id, station, lane, key, color) VALUES ('${seeded.eventId}', 'kitchen', 1, 'F9', 'blue')`)
    await setLanes({ laneCount: 3 })
    expect((await poll()).lanes.map((l) => l.color)).toEqual(['blue', 'green', 'amber'])
  })

  it('refuses bad counts, the admin without a station and the waiter', async () => {
    for (const body of [{ laneCount: 0 }, { laneCount: 5 }, { lane: 5, paused: true }, {}]) {
      await expect(setLanes(body)).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(setLanes({ laneCount: 2 }, 'admin')).rejects.toMatchObject({ statusCode: 400 })
    expect(await setLanes({ station: 'bar', laneCount: 2 }, 'admin')).toEqual({ laneCount: 2, paused: [] })
    expect((await poll('bar')).lanes).toHaveLength(2)
    await expect(setLanes({ laneCount: 2 }, 'waiter' as never)).rejects.toMatchObject({ statusCode: 403 })
  })
})
