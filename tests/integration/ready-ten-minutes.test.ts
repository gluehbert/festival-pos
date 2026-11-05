import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff, type Role } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let waiter: { staffId: string; role: Role }

const API = '../../server/api'
const BIER = () => seeded.menuItemIds[1]!

type Item = { orderItemId: string; menuItemId: string }
async function order(tableNo: number, quantity = 1) {
  return (await call<{ orderId: string; items: Item[] }>(`${API}/orders/index.post`, {
    method: 'POST', staff: waiter, body: { tableNo, mode: 'staff_table', items: [{ menuItemId: BIER(), quantity }] },
  })).body
}
const bar = () => ({ staffId: seeded.staffId, role: 'bar' as Role })
const finish = (orderId: string) =>
  call(`${API}/production/orders/[id]/done.post`, { method: 'POST', staff: bar(), params: { id: orderId }, body: {} })
const patchItem = (id: string, nextStatus: 'in_progress' | 'done') =>
  call(`${API}/production/items/[id].patch`, { method: 'PATCH', staff: bar(), params: { id }, body: { nextStatus } })
const ready = async (tableNo: number) => {
  const list = await call<{ tickets: Array<{ tableNo: number; ready: { bar: number } }> }>(`${API}/tickets/index.get`, { staff: waiter })
  return list.body.tickets.find((t) => t.tableNo === tableNo)?.ready.bar
}
const detail = async (tableNo: number) =>
  (await call<{ items: Array<{ quantity: number; served: boolean }> }>(`${API}/tickets/[id].get`, { staff: waiter, params: { id: `t-${tableNo}` } })).body.items
// Moves the "Fertig" of an order into the past.
const finishedAgo = (orderId: string, minutes: number) => ctx.mem.public.none(
  `UPDATE order_items SET ready_at = '${new Date(Date.now() - minutes * 60_000).toISOString()}' WHERE order_id = '${orderId}'`,
)
const readyAtOf = (id: string) => (ctx.mem.public.one(`SELECT ready_at FROM order_items WHERE id = '${id}'`) as { ready_at: Date | null }).ready_at

describe('finished items count as brought ten minutes after "Fertig"', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' }
  })

  it('keeps the table green for nine minutes, not for eleven', async () => {
    const o = await order(5, 2)
    await finish(o.orderId)
    expect(await ready(5)).toBe(2)
    finishedAgo(o.orderId, 9)
    expect(await ready(5)).toBe(2)
    expect((await detail(5))[0]!.served).toBe(false)
    finishedAgo(o.orderId, 11)
    expect(await ready(5)).toBe(0)
    // The table view agrees: nothing left to bring.
    expect((await detail(5))[0]!.served).toBe(true)
  })

  it('turns the table green again for the next round', async () => {
    const first = await order(6)
    await finish(first.orderId)
    finishedAgo(first.orderId, 15)
    expect(await ready(6)).toBe(0)
    const second = await order(6, 3)
    await finish(second.orderId)
    expect(await ready(6)).toBe(3)
  })

  it('starts the ten minutes at "Fertig" and forgets them on undo', async () => {
    const o = await order(7)
    const id = o.items[0]!.orderItemId
    expect((await patchItem(id, 'done')).status).toBe(200)
    expect(readyAtOf(id)).not.toBeNull()
    expect((await patchItem(id, 'in_progress')).status).toBe(200)
    expect(readyAtOf(id)).toBeNull()
    expect(await ready(7)).toBe(0)
  })
})
