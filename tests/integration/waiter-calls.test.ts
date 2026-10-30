import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest, insertStaff, type Role } from '../setup/call'

// "Call the service": the guest calls with a reason, the table's waiter sees
// it first, everyone after 2 minutes or when nobody holds the table.
beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
type Guest = ReturnType<typeof insertGuest>
type Calls = { calls: Array<{ id: string; tableNo: number; reason: string; assignee: { username: string } | null; escalated: boolean; waitingSeconds: number }> }

const CALLS = '../../server/api/waiter-calls/index.post'
const TABLE = '../../server/api/waiter-calls/table.get'
const LIST = '../../server/api/waiter-calls/index.get'
const ACK = '../../server/api/waiter-calls/[id]/ack.post'

const guestCall = (guest: Guest, reason: string) => call<{ reason: string; acknowledged: boolean } | null>(CALLS, { method: 'POST', guest, body: { reason } })
const tableCall = (guest: Guest) => call<{ reason: string; acknowledged: boolean } | null>(TABLE, { guest })
const list = (staffId: string, role: Role = 'waiter') => call<Calls>(LIST, { staff: { staffId, role } })
const ack = (staffId: string, role: Role, id: string) => call(ACK, { method: 'POST', staff: { staffId, role }, params: { id } })
const enable = () => ctx.mem.public.none(`UPDATE events SET waiter_calls_enabled = true`)
const backdate = (minutes: number) => ctx.mem.public.none(`UPDATE waiter_calls SET created_at = now() - interval '${minutes} minutes'`)

describe('calling the service', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('is off unless the admin switches it on', async () => {
    const guest = insertGuest(seeded.eventId, 5)
    expect(await guestCall(guest, 'pay')).toMatchObject({ status: 409, error: { code: 'FEATURE_OFF' } })
    expect((await tableCall(guest)).body).toBeNull()
    expect((await list(seeded.staffId, 'admin')).body).toEqual({ calls: [] })
  })

  it('one open call per table; a free table reaches everyone at once', async () => {
    enable()
    const a = insertGuest(seeded.eventId, 5)
    expect(await guestCall(a, 'pay')).toMatchObject({ status: 200, body: { reason: 'pay', acknowledged: false } })
    // A second phone at the table sees the same call and adds none.
    const b = insertGuest(seeded.eventId, 5)
    expect((await guestCall(b, 'order')).body).toMatchObject({ reason: 'pay', acknowledged: false })
    expect((await tableCall(b)).body).toMatchObject({ reason: 'pay' })
    expect((ctx.mem.public.one(`SELECT COUNT(*)::int AS n FROM waiter_calls`) as { n: number }).n).toBe(1)

    const res = await list(insertStaff('waiter'))
    expect(res.body.calls).toEqual([expect.objectContaining({ tableNo: 5, reason: 'pay', assignee: null, escalated: true })])
    expect(await guestCall(a, 'nonsense')).toMatchObject({ status: 400 })
  })

  it('a held table reaches its waiter first, everyone after 2 minutes', async () => {
    enable()
    const anna = insertStaff('waiter', 'anna')
    ctx.mem.public.none(`INSERT INTO table_assignments (event_id, table_no, staff_id) VALUES ('${seeded.eventId}', 7, '${anna}')`)
    await guestCall(insertGuest(seeded.eventId, 7), 'question')
    expect((await list(anna)).body.calls).toEqual([expect.objectContaining({ assignee: { staffId: anna, username: 'anna' }, escalated: false })])
    backdate(3)
    expect((await list(anna)).body.calls[0]).toMatchObject({ escalated: true, waitingSeconds: expect.any(Number) })
    expect((await list(anna)).body.calls[0]!.waitingSeconds).toBeGreaterThanOrEqual(180)
  })

  it('the bar passes a call on; the guest sees someone is coming; a new call waits 2 minutes', async () => {
    enable()
    const guest = insertGuest(seeded.eventId, 5)
    await guestCall(guest, 'pay')
    const id = (await list(seeded.staffId, 'admin')).body.calls[0]!.id
    const bar = insertStaff('bar')
    expect((await ack(bar, 'bar', id)).status).toBe(200)
    expect((await ack(bar, 'bar', id)).status).toBe(404)
    expect((await tableCall(guest)).body).toMatchObject({ reason: 'pay', acknowledged: true })
    expect((await list(bar, 'bar')).body.calls).toEqual([])

    expect(await guestCall(guest, 'order')).toMatchObject({ status: 429, error: { code: 'RATE_LIMITED' } })
    backdate(3)
    expect((await guestCall(guest, 'order')).body).toMatchObject({ reason: 'order', acknowledged: false })
  })

  it('"someone is coming" ends 3 minutes after the answer, or once someone served the table', async () => {
    enable()
    const guest = insertGuest(seeded.eventId, 5)
    await guestCall(guest, 'pay')
    await ack(seeded.staffId, 'admin', (await list(seeded.staffId, 'admin')).body.calls[0]!.id)
    ctx.mem.public.none(`UPDATE waiter_calls SET acknowledged_at = now() - interval '2 minutes'`)
    expect((await tableCall(guest)).body).toMatchObject({ acknowledged: true })
    ctx.mem.public.none(`UPDATE waiter_calls SET acknowledged_at = now() - interval '4 minutes'`)
    expect((await tableCall(guest)).body).toBeNull()

    backdate(3)
    await guestCall(guest, 'question')
    await ack(seeded.staffId, 'admin', (await list(seeded.staffId, 'admin')).body.calls[0]!.id)
    expect((await tableCall(guest)).body).toMatchObject({ reason: 'question', acknowledged: true })
    await call('../../server/api/tickets/[id]/checked.post', { method: 'POST', staff: { staffId: seeded.staffId, role: 'waiter' }, params: { id: 't-5' } })
    expect((await tableCall(guest)).body).toBeNull()
  })

  it('a staff order, a payment or "asked" at the table answers its call', async () => {
    enable()
    const waiter = insertStaff('waiter')
    const open = () => (ctx.mem.public.one(`SELECT COUNT(*)::int AS n FROM waiter_calls WHERE acknowledged_at IS NULL`) as { n: number }).n
    const order = await call<{ items: Array<{ orderItemId: string }> }>('../../server/api/orders/index.post', {
      method: 'POST', staff: { staffId: waiter, role: 'waiter' }, key: 'o1',
      body: { tableNo: 5, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 1 }] },
    })

    await guestCall(insertGuest(seeded.eventId, 5), 'pay')
    expect(open()).toBe(1)
    await call('../../server/api/payments/index.post', {
      method: 'POST', staff: { staffId: waiter, role: 'waiter' }, key: 'p1',
      body: { ticketKey: 't-5', orderItemIds: [order.body.items[0]!.orderItemId] },
    })
    expect(open()).toBe(0)

    backdate(3)
    await guestCall(insertGuest(seeded.eventId, 5), 'order')
    await call('../../server/api/orders/index.post', {
      method: 'POST', staff: { staffId: waiter, role: 'waiter' }, key: 'o2',
      body: { tableNo: 5, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 1 }] },
    })
    expect(open()).toBe(0)

    backdate(3)
    await guestCall(insertGuest(seeded.eventId, 5), 'question')
    const guest = insertGuest(seeded.eventId, 5)
    await call('../../server/api/tickets/[id]/checked.post', { method: 'POST', staff: { staffId: waiter, role: 'waiter' }, params: { id: 't-5' } })
    expect(open()).toBe(0)
    // Served, not just announced: the guest's notice is gone.
    expect((await tableCall(guest)).body).toBeNull()
  })

  it('kitchen and guests without a live session are turned away', async () => {
    enable()
    expect((await list(insertStaff('kitchen'), 'kitchen')).status).toBe(403)
    expect((await call(CALLS, { method: 'POST', body: { reason: 'pay' } })).status).toBe(401)
    expect((await call(TABLE, {})).status).toBe(401)
    // A session ended at the end of a shift cannot call either.
    const ended = insertGuest(seeded.eventId, 5)
    ctx.mem.public.none(`UPDATE guest_sessions SET expires_at = now() - interval '1 minute'`)
    expect((await guestCall(ended, 'pay')).status).toBe(401)
  })
})
