import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertGuest, insertStaff, type Role } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
let cafe: { staffId: string; role: Role }
let kitchen: { staffId: string; role: Role }

const API = '../../server/api'
const POMMES = () => seeded.menuItemIds[0]!
const KUCHEN = () => seeded.menuItemIds[1]!

async function orderCake(tableNo: number) {
  const guest = insertGuest(seeded.eventId, tableNo)
  const res = await call<{ items: Array<{ orderItemId: string }> }>(`${API}/orders/index.post`, {
    method: 'POST', guest, body: { tableNo, items: [{ menuItemId: KUCHEN(), quantity: 1 }] },
  })
  expect(res.status).toBe(201)
  return res.body.items[0]!.orderItemId
}
const queue = async (who: { staffId: string; role: Role }) =>
  (await call<{ items: Array<{ orderItemId: string }>; cafeClosed: boolean }>(`${API}/production/queue.get`, { staff: who })).body
const setClosed = (who: { staffId: string; role: Role }, closed: boolean) =>
  call<{ closed: boolean }>(`${API}/production/cafe.patch`, { method: 'PATCH', staff: who, body: { closed } })

describe('cafe counter closed: coffee and cake go to the kitchen', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, {
      tableRangeFrom: 1,
      tableRangeTo: 20,
      items: [
        { nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'food', station: 'kitchen' },
        { nameDe: 'Kuchen', nameEn: 'Cake', priceCents: 300, category: 'cafe', station: 'cafe' },
      ],
    })
    cafe = { staffId: insertStaff('cafe', 'theke'), role: 'cafe' }
    kitchen = { staffId: insertStaff('kitchen', 'koch'), role: 'kitchen' }
  })

  it('sends new cake orders to the kitchen once the counter closed; open ones stay at the counter', async () => {
    const before = await orderCake(1)
    expect((await setClosed(cafe, true)).body).toEqual({ closed: true })
    const after = await orderCake(2)

    const counter = await queue(cafe)
    expect(counter.cafeClosed).toBe(true)
    expect(counter.items.map((i) => i.orderItemId)).toEqual([before])
    expect((await queue(kitchen)).items.map((i) => i.orderItemId)).toEqual([after])

    // Open again: the next slice goes to the counter.
    await setClosed(cafe, false)
    const third = await orderCake(3)
    expect((await queue(cafe)).items.map((i) => i.orderItemId)).toEqual([before, third])
  })

  it('shows guests the cake under the kitchen while the counter is closed', async () => {
    ctx.mem.public.none(`UPDATE events SET cafe_closed = true WHERE id = '${seeded.eventId}'`)
    const menu = await call<{ items: Array<{ id: string; station: string }> }>(`${API}/menu/index.get`, {})
    expect(menu.body.items.find((i) => i.id === KUCHEN())!.station).toBe('kitchen')
    expect(menu.body.items.find((i) => i.id === POMMES())!.station).toBe('kitchen')
  })

  it('lets the kitchen mark cake sold out only while the counter is closed', async () => {
    const soldOut = () => call(`${API}/menu/[id]/availability.patch`, { method: 'PATCH', staff: kitchen, params: { id: KUCHEN() }, body: { isAvailable: false } })
    expect((await soldOut()).status).toBe(403)
    ctx.mem.public.none(`UPDATE events SET cafe_closed = true WHERE id = '${seeded.eventId}'`)
    expect((await soldOut()).status).toBe(200)
    const list = await call<{ items: Array<{ id: string }> }>(`${API}/production/menu.get`, { staff: kitchen })
    expect(list.body.items.map((i) => i.id)).toContain(KUCHEN())
  })

  it('refuses the switch to the kitchen and the bar', async () => {
    expect((await setClosed(kitchen, true)).status).toBe(403)
    expect((await setClosed({ staffId: insertStaff('bar', 'zapf'), role: 'bar' }, true)).status).toBe(403)
  })
})
