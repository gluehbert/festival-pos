import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import type { WaitTimeRow } from '../../server/lib/contracts/reports'
import { localHourOf, percentile } from '../../server/lib/reports-wait'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let eventId: string
let staffId: string
let menuItemId: string

async function waitTimes(): Promise<WaitTimeRow[]> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/admin/events/[id]/reports.get')).default
  const { event } = makeEvent({ method: 'GET', url: `/api/admin/events/${eventId}/reports?type=wait_times` })
  event.context.params = { id: eventId }
  event.context.auth = { staff: { staffId, role: 'admin', username: 'admin' } }
  return ((await handler(event)) as { rows: WaitTimeRow[] }).rows
}

// One item, ordered at `at`, finished `seconds` later (null = not finished).
function item(station: string, at: string, seconds: number | null, opts: { trial?: boolean; cancelled?: boolean } = {}) {
  const id = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, kind, created_by_staff, is_trial)
     VALUES ('${eventId}', 4, 'staff_table', '${staffId}', ${opts.trial ?? false}) RETURNING id`,
  ) as { id: string }).id
  const created = new Date(at)
  const ready = seconds === null ? 'NULL' : `'${new Date(created.getTime() + seconds * 1000).toISOString()}'`
  const status = opts.cancelled ? 'cancelled' : seconds === null ? 'pending' : 'done'
  ctx.mem.public.none(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, production_status, created_at, ready_at)
     VALUES ('${id}', '${menuItemId}', 1, 400, '${station}', '${status}', '${created.toISOString()}', ${ready})`,
  )
}

describe('wait times report', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    const seeded = seedEvent(ctx.mem)
    eventId = seeded.eventId
    staffId = seeded.staffId
    menuItemId = seeded.menuItemIds[0]!
  })

  it('is empty without finished items', async () => {
    item('kitchen', '2026-07-04T16:00:00Z', null)
    expect(await waitTimes()).toEqual([])
  })

  it('reports median, p90 and the slowest hour per station, kitchen first', async () => {
    // 16:xx UTC = 18:xx in Berlin (summer time): five quick items.
    for (const s of [120, 180, 240, 300, 360]) item('kitchen', '2026-07-04T16:10:00Z', s)
    // 17:xx UTC = 19:xx Berlin: the rush, five slow items.
    for (const s of [900, 1000, 1100, 1200, 1500]) item('kitchen', '2026-07-04T17:05:00Z', s)
    // Only two in this hour: too few to name it the slowest.
    item('kitchen', '2026-07-04T18:00:00Z', 3000)
    item('kitchen', '2026-07-04T18:01:00Z', 3000)
    item('bar', '2026-07-04T16:00:00Z', 60)
    // Never counted: rehearsal, cancelled, not finished.
    item('bar', '2026-07-04T16:00:00Z', 5000, { trial: true })
    item('bar', '2026-07-04T16:00:00Z', 5000, { cancelled: true })
    item('bar', '2026-07-04T16:00:00Z', null)

    const rows = await waitTimes()
    expect(rows.map((r) => r.station)).toEqual(['kitchen', 'bar'])
    expect(rows[0]).toEqual({
      station: 'kitchen',
      itemCount: 12,
      medianSeconds: 900,
      p90Seconds: 3000,
      peakHour: '2026-07-04T19:00',
      peakHourMedianSeconds: 1100,
    })
    expect(rows[1]).toEqual({ station: 'bar', itemCount: 1, medianSeconds: 60, p90Seconds: 60, peakHour: null, peakHourMedianSeconds: null })
  })
})

describe('wait time helpers', () => {
  it('nearest-rank percentile', () => {
    expect(percentile([], 50)).toBe(0)
    expect(percentile([5], 90)).toBe(5)
    expect(percentile([1, 2, 3, 4], 50)).toBe(2)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9)
  })

  it('buckets by the Berlin hour, also in winter', () => {
    expect(localHourOf(new Date('2026-07-04T16:59:00Z'))).toBe('2026-07-04T18:00')
    expect(localHourOf(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01T00:00')
  })
})
