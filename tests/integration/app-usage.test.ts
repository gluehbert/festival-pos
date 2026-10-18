import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import type { AppUsageRow } from '../../server/lib/contracts/reports'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let eventId: string
let staffId: string
let menuItemId: string

async function signIn(tableNo: number) {
  const { makeEvent } = await import('../setup/h3-event')
  ctx.setBody({ tableNo, pin: 'DEMO1' })
  const handler = (await import('../../server/api/session.post')).default
  const { event } = makeEvent({ method: 'POST' })
  return (await handler(event)) as { sessionId: string }
}

async function usage(): Promise<AppUsageRow[]> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/admin/events/[id]/reports.get')).default
  const { event } = makeEvent({ method: 'GET', url: `/api/admin/events/${eventId}/reports?type=app_usage` })
  event.context.params = { id: eventId }
  event.context.auth = { staff: { staffId, role: 'admin', username: 'admin' } }
  return ((await handler(event)) as { rows: AppUsageRow[] }).rows
}

function order(tableNo: number, kind: 'guest' | 'staff_table' | 'walkin', qty: number, opts: { session?: string; trial?: boolean; cancelled?: boolean } = {}) {
  const origin = kind === 'guest' ? `'${opts.session}', NULL` : `NULL, '${staffId}'`
  const id = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, kind, guest_session_id, created_by_staff, is_trial)
     VALUES ('${eventId}', ${tableNo}, '${kind}', ${origin}, ${opts.trial ?? false}) RETURNING id`,
  ) as { id: string }).id
  ctx.mem.public.none(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station, production_status)
     VALUES ('${id}', '${menuItemId}', ${qty}, 400, 'bar', '${opts.cancelled ? 'cancelled' : 'pending'}')`,
  )
}

describe('app usage report', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    const seeded = seedEvent(ctx.mem)
    eventId = seeded.eventId
    staffId = seeded.staffId
    menuItemId = seeded.menuItemIds[1]!
  })

  it('counts sign-ins per table, also after the guest sessions are swept', async () => {
    await signIn(3)
    await signIn(3)
    await signIn(5)
    ctx.mem.public.none('DELETE FROM guest_sessions')
    expect(await usage()).toEqual([
      { tableNo: 3, scans: 2, orderingDevices: 0, guestOrders: 0, staffOrders: 0, guestItems: 0, staffItems: 0 },
      { tableNo: 5, scans: 1, orderingDevices: 0, guestOrders: 0, staffOrders: 0, guestItems: 0, staffItems: 0 },
    ])
  })

  it('does not count sign-ins while the event is in rehearsal', async () => {
    ctx.mem.public.none(`UPDATE events SET trial_mode = true WHERE id = '${eventId}'`)
    await signIn(3)
    expect(await usage()).toEqual([])
  })

  it('splits table orders into app and waiter, without walk-ins, rehearsal and cancelled items', async () => {
    const a = (await signIn(1)).sessionId
    const b = (await signIn(1)).sessionId
    await signIn(1)
    order(1, 'guest', 2, { session: a })
    order(1, 'guest', 1, { session: a })
    order(1, 'guest', 3, { session: b, cancelled: true })
    order(1, 'staff_table', 4)
    order(2, 'staff_table', 5)
    order(2, 'staff_table', 1, { trial: true })
    order(0, 'walkin', 7)
    expect(await usage()).toEqual([
      { tableNo: 1, scans: 3, orderingDevices: 2, guestOrders: 3, staffOrders: 1, guestItems: 3, staffItems: 4 },
      { tableNo: 2, scans: 0, orderingDevices: 0, guestOrders: 0, staffOrders: 1, guestItems: 0, staffItems: 5 },
    ])
  })
})
