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
const POMMES = () => seeded.menuItemIds[0]!
const BIER = () => seeded.menuItemIds[1]!

type Item = { orderItemId: string; menuItemId: string }
async function order(tableNo: number, items: Array<{ menuItemId: string; quantity: number }>) {
  return (await call<{ orderId: string; items: Item[] }>(`${API}/orders/index.post`, {
    method: 'POST', staff: waiter, body: { tableNo, mode: 'staff_table', items },
  })).body
}
const finish = (orderId: string, role: Role) =>
  call(`${API}/production/orders/[id]/done.post`, { method: 'POST', staff: { staffId: seeded.staffId, role }, params: { id: orderId }, body: {} })
const pay = (tableNo: number, orderItemIds: string[], quantities?: Record<string, number>) =>
  call(`${API}/payments/index.post`, { method: 'POST', staff: waiter, body: { ticketKey: `t-${tableNo}`, orderItemIds, quantities } })
const ready = async (tableNo: number) => {
  const list = await call<{ tickets: Array<{ tableNo: number; ready: { kitchen: number; bar: number } }> }>(`${API}/tickets/index.get`, { staff: waiter })
  return list.body.tickets.find((t) => t.tableNo === tableNo)?.ready
}
const servedRows = () => ctx.mem.public.many(`SELECT quantity, payment_status, served_at FROM order_items ORDER BY quantity`) as Array<{ quantity: number; payment_status: string; served_at: Date | null }>

describe('ready to bring follows cashing, not the "Gebracht" button', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    waiter = { staffId: insertStaff('waiter', 'anna'), role: 'waiter' }
  })

  it('counts finished drinks as brought once they are cashed', async () => {
    const o = await order(5, [{ menuItemId: BIER(), quantity: 3 }, { menuItemId: POMMES(), quantity: 1 }])
    await finish(o.orderId, 'bar')
    expect(await ready(5)).toEqual({ kitchen: 0, bar: 3 })

    // One guest pays two beers: those are brought, the third is still to bring.
    const beer = o.items.find((i) => i.menuItemId === BIER())!.orderItemId
    expect((await pay(5, [beer], { [beer]: 2 })).status).toBe(201)
    expect(await ready(5)).toEqual({ kitchen: 0, bar: 1 })
    expect((await pay(5, [beer])).status).toBe(201)
    expect(await ready(5)).toEqual({ kitchen: 0, bar: 0 })
    expect(servedRows().filter((r) => r.payment_status === 'paid').every((r) => r.served_at !== null)).toBe(true)
  })

  it('never asks the waiter to bring food that was paid at ordering', async () => {
    const o = await order(6, [{ menuItemId: POMMES(), quantity: 2 }, { menuItemId: BIER(), quantity: 1 }])
    const pommes = o.items.find((i) => i.menuItemId === POMMES())!.orderItemId
    expect((await pay(6, [pommes])).status).toBe(201)
    // Paid before it was finished: not marked brought, the kitchen's helpers hand it out.
    expect(servedRows().find((r) => r.payment_status === 'paid')!.served_at).toBeNull()
    await finish(o.orderId, 'kitchen')
    expect(await ready(6)).toEqual({ kitchen: 0, bar: 0 })
  })
})
