import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest, insertStaff } from '../setup/call'

// Someone walks past a table, orders on its QR code and walks on: guest
// sessions end (12 h, end of shift), a phone has a cap on unpaid orders,
// and the bill shows which phone ordered what.
beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
type Guest = ReturnType<typeof insertGuest>

const ORDERS = '../../server/api/orders/index.post'
const ME = '../../server/api/session/me.get'
const END = '../../server/api/tickets/guest-sessions/end.post'
const TICKET = '../../server/api/tickets/[id].get'
const BRANDING = '../../server/api/admin/events/[id]/branding.patch'

// Seed menu: 0 = fries 3.50 € (kitchen), 1 = beer 4 € (bar).
function order(guest: Guest, items: Array<[number, number]>, key: string) {
  return call<{ items: Array<{ orderItemId: string }> }>(ORDERS, {
    method: 'POST',
    guest,
    key,
    body: { tableNo: guest.tableNo, items: items.map(([i, quantity]) => ({ menuItemId: seeded.menuItemIds[i]!, quantity })) },
  })
}

const one = <T>(sql: string) => ctx.mem.public.one(sql) as T

describe('guest abuse protection', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('a new guest session and its cookie last 12 hours', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { tableKey } = await import('../../server/lib/table-key')
    ctx.setBody({ tableNo: 5, key: tableKey(seeded.eventId, 5) })
    const { event, getSetCookies } = makeEvent({ method: 'POST' })
    const res = await (await import('../../server/api/session.post')).default(event) as { expiresAt: string }
    const hours = (new Date(res.expiresAt).getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(11.9)
    expect(hours).toBeLessThanOrEqual(12)
    expect(getSetCookies().find((c) => c.startsWith('pos_guest='))).toMatch(/Max-Age=43200/)
  })

  it('an expired session can neither order nor pass as signed in', async () => {
    const guest = insertGuest(seeded.eventId, 5)
    ctx.mem.public.none(`UPDATE guest_sessions SET expires_at = now() - interval '1 minute'`)
    expect((await call(ME, { guest })).status).toBe(401)
    expect(await order(guest, [[1, 1]], 'k1')).toMatchObject({ status: 401, error: { code: 'UNAUTHORIZED' } })
    expect(one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM orders`).n).toBe(0)
  })

  it('the shift lead ends all guest sessions; guests scan again, bills stay', async () => {
    const a = insertGuest(seeded.eventId, 5)
    const b = insertGuest(seeded.eventId, 6)
    expect((await order(a, [[1, 2]], 'a1')).status).toBe(201)

    const waiter = insertStaff('waiter')
    expect((await call(END, { method: 'POST', staff: { staffId: waiter, role: 'waiter' } })).status).toBe(403)

    const lead = insertStaff('lead')
    const ended = await call(END, { method: 'POST', staff: { staffId: lead, role: 'lead' } })
    expect(ended).toMatchObject({ status: 200, body: { ended: 2 } })
    expect(one(`SELECT action, staff_id, payload FROM audit_log WHERE action = 'guest_sessions_end'`))
      .toEqual({ action: 'guest_sessions_end', staff_id: lead, payload: { sessions: 2 } })

    for (const g of [a, b]) {
      expect((await call(ME, { guest: g })).status).toBe(401)
      expect((await order(g, [[1, 1]], `after-${g.tableNo}`)).status).toBe(401)
    }
    // The order placed before stays on the bill.
    expect(one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM order_items WHERE production_status <> 'cancelled'`).n).toBe(1)
    // Scanning again opens a new session that can order.
    expect((await order(insertGuest(seeded.eventId, 5), [[1, 1]], 'a2')).status).toBe(201)
    // Nothing left to end.
    expect((await call(END, { method: 'POST', staff: { staffId: lead, role: 'lead' } })).body).toEqual({ ended: 1 })
  })

  it('caps what one phone has ordered and not paid, per station', async () => {
    const phone = insertGuest(seeded.eventId, 5)
    // Default caps: drinks 50 €, food 80 €.
    expect((await order(phone, [[1, 12]], 'b1')).status).toBe(201) // 48 €
    const over = await order(phone, [[1, 1]], 'b2')
    expect(over).toMatchObject({ status: 409, error: { code: 'OPEN_LIMIT', details: { station: 'bar', limitCents: 5000 } } })
    expect(one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM orders`).n).toBe(1)

    // Food has its own cap, and an order over it alone is refused too.
    expect((await order(phone, [[0, 22]], 'k1')).status).toBe(201) // 77 €
    expect(await order(phone, [[0, 1]], 'k2')).toMatchObject({ status: 409, error: { details: { station: 'kitchen' } } })
    expect((await order(insertGuest(seeded.eventId, 6), [[0, 23]], 'k3')).error).toMatchObject({ code: 'OPEN_LIMIT' })

    // Another phone at the same table and the waiter are not affected.
    expect((await order(insertGuest(seeded.eventId, 5), [[1, 2]], 'c1')).status).toBe(201)
    const staff = await call(ORDERS, {
      method: 'POST',
      staff: { staffId: seeded.staffId, role: 'admin' },
      key: 's1',
      body: { tableNo: 5, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 20 }] },
    })
    expect(staff.status).toBe(201)

    // Paid and voided items no longer count.
    ctx.mem.public.none(`UPDATE order_items SET payment_status = 'paid' WHERE station = 'bar'`)
    expect((await order(phone, [[1, 12]], 'b3')).status).toBe(201)
    ctx.mem.public.none(`UPDATE order_items SET production_status = 'cancelled' WHERE station = 'bar'`)
    expect((await order(phone, [[1, 12]], 'b4')).status).toBe(201)
  })

  it('the admin sets the caps per event; empty means no cap', async () => {
    const staff = { staffId: seeded.staffId, role: 'admin' as const }
    const params = { id: seeded.eventId }
    const patch = (body: unknown) => call(BRANDING, { method: 'PATCH', staff, params, body })
    expect((await patch({ guestOpenLimitBarCents: 50 })).status).toBe(400)
    expect((await call(BRANDING, { method: 'PATCH', staff: { ...staff, role: 'lead' }, params, body: { guestOpenLimitBarCents: 1000 } })).status).toBe(403)
    expect((await patch({ guestOpenLimitBarCents: 1000, guestOpenLimitKitchenCents: null })).status).toBe(200)

    const { loadEventDto } = await import('../../server/lib/events')
    const { getDb } = await import('../../server/db/client')
    expect(await loadEventDto(getDb(), seeded.eventId)).toMatchObject({ guestOpenLimitBarCents: 1000, guestOpenLimitKitchenCents: null })

    const phone = insertGuest(seeded.eventId, 5)
    expect(await order(phone, [[1, 3]], 'b1')).toMatchObject({ status: 409, error: { details: { limitCents: 1000 } } })
    expect((await order(phone, [[0, 40]], 'k1')).status).toBe(201)
  })

  it('the bill numbers the guest phones of a table; waiter orders have none', async () => {
    const first = insertGuest(seeded.eventId, 5)
    const second = insertGuest(seeded.eventId, 5)
    // The phone that scanned later orders first and gets number 1.
    await order(second, [[1, 1]], 'x1')
    await call(ORDERS, {
      method: 'POST',
      staff: { staffId: seeded.staffId, role: 'admin' },
      key: 's1',
      body: { tableNo: 5, mode: 'staff_table', items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] },
    })
    await order(first, [[1, 1]], 'y1')
    await order(second, [[0, 1]], 'x2')

    const res = await call<{ items: Array<{ device: number | null }> }>(TICKET, {
      staff: { staffId: seeded.staffId, role: 'waiter' },
      params: { id: 't-5' },
    })
    expect(res.status).toBe(200)
    expect(res.body.items.map((i) => i.device)).toEqual([1, null, 2, 1])
  })
})
