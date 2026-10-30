import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest, insertStaff, type Role } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let waiter: { staffId: string; role: Role }
let kitchen: { staffId: string; role: Role }

const API = '../../server/api'
const POMMES = () => seeded.menuItemIds[0]!
const BIER = () => seeded.menuItemIds[1]!

type Item = { orderItemId: string; menuItemId: string }
async function guestOrder(tableNo: number) {
  const guest = insertGuest(seeded.eventId, tableNo)
  const res = await call<{ orderId: string; items: Item[] }>(`${API}/orders/index.post`, {
    method: 'POST', guest, body: { tableNo, items: [{ menuItemId: POMMES(), quantity: 2 }, { menuItemId: BIER(), quantity: 1 }] },
  })
  expect(res.status).toBe(201)
  return { guest, order: res.body, pommes: res.body.items.find((i) => i.menuItemId === POMMES())!.orderItemId }
}
const queue = async (role: Role) =>
  (await call<{ items: Array<{ orderItemId: string }> }>(`${API}/production/queue.get`, { staff: { staffId: seeded.staffId, role } })).body.items
const ticket = async (tableNo: number) => {
  const list = await call<{ tickets: Array<{ tableNo: number; status: string; foodToPay: number }> }>(`${API}/tickets/index.get`, { staff: waiter })
  return list.body.tickets.find((t) => t.tableNo === tableNo)
}
const pay = (tableNo: number, orderItemIds: string[]) =>
  call(`${API}/payments/index.post`, { method: 'POST', staff: waiter, body: { ticketKey: `t-${tableNo}`, orderItemIds } })
const prepay = (on: boolean) => ctx.mem.public.none(`UPDATE events SET food_prepay_enabled = ${on} WHERE id = '${seeded.eventId}'`)

describe('food prepay: the kitchen cooks paid food only', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' }
    kitchen = { staffId: insertStaff('kitchen', 'koch'), role: 'kitchen' }
    prepay(true)
  })

  it('holds a guest\'s food until the waiter cashes it; drinks go to the bar at once', async () => {
    const { guest, pommes } = await guestOrder(4)
    expect(await queue('kitchen')).toEqual([])
    expect(await queue('bar')).toHaveLength(1)
    expect(await ticket(4)).toMatchObject({ status: 'open', foodToPay: 2 })
    const session = await call<{ items: Array<{ orderItemId: string; awaitingPayment: boolean }> }>(`${API}/orders/session.get`, { guest })
    expect(session.body.items.map((i) => [i.orderItemId === pommes, i.awaitingPayment]).sort()).toEqual([[false, false], [true, true]])

    // The kitchen cannot start it, neither by item nor by finishing the order.
    const patch = await call(`${API}/production/items/[id].patch`, { method: 'PATCH', staff: kitchen, params: { id: pommes }, body: { nextStatus: 'in_progress' } })
    expect(patch).toMatchObject({ status: 409, error: { code: 'NOT_PAID' } })

    expect((await pay(4, [pommes])).status).toBe(201)
    expect((await queue('kitchen')).map((i) => i.orderItemId)).toEqual([pommes])
    // The beer is still to pay: the table stays open, nothing left to cash for the kitchen.
    expect(await ticket(4)).toMatchObject({ status: 'open', foodToPay: 0 })
    const after = await call<{ items: Array<{ awaitingPayment: boolean }> }>(`${API}/orders/session.get`, { guest })
    expect(after.body.items.every((i) => !i.awaitingPayment)).toBe(true)
  })

  it('"finish order" in the kitchen leaves unpaid food alone', async () => {
    const { order, pommes } = await guestOrder(5)
    const done = await call<{ doneItemIds: string[] }>(`${API}/production/orders/[id]/done.post`, { method: 'POST', staff: kitchen, params: { id: order.orderId }, body: {} })
    expect(done.body.doneItemIds).toEqual([])
    const row = ctx.mem.public.one(`SELECT production_status FROM order_items WHERE id = '${pommes}'`) as { production_status: string }
    expect(row.production_status).toBe('pending')
  })

  it('switched off, food goes to the kitchen unpaid as before', async () => {
    prepay(false)
    const { guest, pommes } = await guestOrder(6)
    expect((await queue('kitchen')).map((i) => i.orderItemId)).toEqual([pommes])
    expect(await ticket(6)).toMatchObject({ foodToPay: 0 })
    const session = await call<{ items: Array<{ awaitingPayment: boolean }> }>(`${API}/orders/session.get`, { guest })
    expect(session.body.items.every((i) => !i.awaitingPayment)).toBe(true)
  })
})
