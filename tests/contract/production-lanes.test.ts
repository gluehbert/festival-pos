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

function buzzers(one: string | null, two: string | null) {
  const q = (v: string | null) => (v === null ? 'NULL' : `'${v}'`)
  ctx.mem.public.none(`UPDATE events SET buzzer_key = ${q(one)}, buzzer_key_2 = ${q(two)} WHERE id = '${seeded.eventId}'`)
}

function finish(itemId: string) {
  ctx.mem.public.none(`UPDATE order_items SET production_status = 'done' WHERE id = '${itemId}'`)
}

async function poll(): Promise<{ lanes: Array<{ lane: number; key: string; groupKey: string | null }>; items: Array<{ tableNo: number; productionStatus: string }> }> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/production/queue.get')).default
  const { event } = makeEvent({ method: 'GET', url: '/api/production/queue' })
  event.context.auth = { staff: { staffId: seeded.staffId, role: 'kitchen', username: 'k' } }
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
    expect(first.lanes).toEqual([{ lane: 1, key: 'F9', groupKey: 'table:12' }, { lane: 2, key: 'F10', groupKey: 'table:7' }])
    // Taken cards are "in preparation" for the guest, the waiting one is not.
    expect(first.items.map((i) => [i.tableNo, i.productionStatus])).toEqual([[12, 'in_progress'], [7, 'in_progress'], [3, 'pending']])

    // Polling again changes nothing; finishing lane 1 refills lane 1 only.
    expect((await poll()).lanes).toEqual(first.lanes)
    finish(t12)
    expect((await poll()).lanes).toEqual([{ lane: 1, key: 'F9', groupKey: 'table:3' }, { lane: 2, key: 'F10', groupKey: 'table:7' }])
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
    expect(after.lanes).toEqual([{ lane: 1, key: 'F9', groupKey: 'table:12' }, { lane: 2, key: 'F10', groupKey: 'table:7' }])
    expect(after.items.map((i) => i.tableNo)).toEqual([12, 7, 5])
  })

  it('an empty lane waits; a removed buzzer frees its card', async () => {
    order(12, 0)
    buzzers('F9', 'F10')
    expect((await poll()).lanes).toEqual([{ lane: 1, key: 'F9', groupKey: 'table:12' }, { lane: 2, key: 'F10', groupKey: null }])
    order(7, 10)
    expect((await poll()).lanes).toEqual([{ lane: 1, key: 'F9', groupKey: 'table:12' }, { lane: 2, key: 'F10', groupKey: 'table:7' }])

    buzzers(null, 'F10')
    expect((await poll()).lanes).toEqual([{ lane: 2, key: 'F10', groupKey: 'table:7' }])
    buzzers(null, null)
    expect((await poll()).lanes).toEqual([])
    expect(ctx.mem.public.many('SELECT * FROM production_lanes')).toEqual([])
  })

  it('the admin cannot give both buzzers the same key', async () => {
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
    const stored = () => ctx.mem.public.one(`SELECT buzzer_key, buzzer_key_2 FROM events WHERE id = '${seeded.eventId}'`)
    await req({ buzzerKey: 'F9' })
    await expect(req({ buzzerKey2: 'F9' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(req({ buzzerKey: 'F10', buzzerKey2: 'F10' })).rejects.toMatchObject({ statusCode: 400 })
    await req({ buzzerKey2: 'F10' })
    expect(stored()).toEqual({ buzzer_key: 'F9', buzzer_key_2: 'F10' })
  })
})
