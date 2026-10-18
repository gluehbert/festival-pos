import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, type Role } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const ROUTE = '../../server/api/order-items/[id]/void.post'

async function placeItem(eventId = seeded.eventId): Promise<string> {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${eventId}', 5, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${eventId}', 5, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  const m = ctx.mem.public.one(
    `SELECT price_cents, station FROM menu_items WHERE id='${seeded.menuItemIds[0]}'`,
  ) as { price_cents: number; station: string }
  return (ctx.mem.public.one(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${seeded.menuItemIds[0]}', 1, ${m.price_cents}, '${m.station}') RETURNING id`,
  ) as { id: string }).id
}

function voidAs(role: Role, id: string, reason = 'spilled drink') {
  return call(ROUTE, { method: 'POST', staff: { staffId: seeded.staffId, role }, params: { id }, body: { reason } })
}

function status(id: string): string {
  return (ctx.mem.public.one(`SELECT production_status FROM order_items WHERE id='${id}'`) as { production_status: string }).production_status
}

describe('POST /api/order-items/{id}/void', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('VoidItemSchema enforces min reason length', async () => {
    const { VoidItemSchema } = await import('../../server/lib/contracts/staff')
    expect(() => VoidItemSchema.parse({ reason: 'ok' })).toThrow()
    expect(VoidItemSchema.parse({ reason: 'fine' })).toEqual({ reason: 'fine' })
  })

  it('waiter can void a pending item; the id comes from the path', async () => {
    const itemId = await placeItem()
    const r = await voidAs('waiter', itemId)
    expect(r).toMatchObject({ status: 200, body: { ok: true } })

    const row = ctx.mem.public.one(
      `SELECT production_status, void_reason FROM order_items WHERE id='${itemId}'`,
    ) as { production_status: string; void_reason: string }
    expect(row.production_status).toBe('cancelled')
    expect(row.void_reason).toBe('spilled drink')

    const audit = ctx.mem.public.many(`SELECT action, reason FROM audit_log`)
    expect(audit.length).toBe(1)
    expect((audit[0] as { action: string }).action).toBe('void')
  })

  it('waiter can void an item that is in progress', async () => {
    const itemId = await placeItem()
    ctx.mem.public.none(`UPDATE order_items SET production_status='in_progress' WHERE id='${itemId}'`)
    expect((await voidAs('waiter', itemId)).status).toBe(200)
    expect(status(itemId)).toBe('cancelled')
  })

  it('waiter cannot void a finished or served item, admin can', async () => {
    const done = await placeItem()
    const served = await placeItem()
    ctx.mem.public.none(`UPDATE order_items SET production_status='done' WHERE id IN ('${done}', '${served}')`)
    ctx.mem.public.none(`UPDATE order_items SET served_at=now() WHERE id='${served}'`)

    for (const id of [done, served]) {
      const r = await voidAs('waiter', id)
      expect(r.status).toBe(403)
      expect(r.error?.code).toBe('VOID_ADMIN_ONLY')
      expect(status(id)).toBe('done')
    }
    for (const id of [done, served]) {
      expect((await voidAs('admin', id)).status).toBe(200)
      expect(status(id)).toBe('cancelled')
    }
  })

  it('rejects kitchen role with 403', async () => {
    const itemId = await placeItem()
    expect((await voidAs('kitchen', itemId)).status).toBe(403)
  })

  it('rejects reason shorter than 3 chars and a malformed id', async () => {
    const itemId = await placeItem()
    expect((await voidAs('waiter', itemId, 'ab')).status).toBe(400)
    expect((await voidAs('waiter', 'not-a-uuid')).status).toBe(400)
  })

  it('returns 409 when item is already paid or already voided', async () => {
    const paid = await placeItem()
    ctx.mem.public.none(`UPDATE order_items SET payment_status='paid' WHERE id='${paid}'`)
    const r = await voidAs('admin', paid, 'mistake')
    expect(r.status).toBe(409)
    expect(r.error?.code).toBe('VOID_PAID')

    const twice = await placeItem()
    expect((await voidAs('waiter', twice)).status).toBe(200)
    expect((await voidAs('waiter', twice)).error?.code).toBe('VOID_CANCELLED')
  })

  it('needs an active event and only voids items of that event', async () => {
    const other = (ctx.mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to) VALUES ('Alt', 'OLD1', 1, 10) RETURNING id`,
    ) as { id: string }).id
    const foreign = await placeItem(other)
    expect((await voidAs('admin', foreign)).status).toBe(404)
    expect(status(foreign)).toBe('pending')

    const own = await placeItem()
    ctx.mem.public.none(`UPDATE events SET is_active=false`)
    expect((await voidAs('admin', own)).status).toBe(404)
    expect(status(own)).toBe('pending')
  })
})
