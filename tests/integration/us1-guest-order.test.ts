import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[] }

async function createGuest(tableNo: number) {
  const { makeEvent } = await import('../setup/h3-event')
  ctx.setBody({ tableNo, pin: 'DEMO1' })
  const handler = (await import('../../server/api/session.post')).default
  const { event, getSetCookies } = makeEvent({ method: 'POST' })
  const result = await handler(event) as { sessionId: string; eventId: string; tableNo: number }
  return { result, cookies: getSetCookies() }
}

describe('US1 guest order — integration', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('scenario 1+2+4: manual entry, session+cookie set, /api/menu hides unavailable', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const session = await createGuest(3)
    expect(session.result.tableNo).toBe(3)
    expect(session.cookies.some((c) => c.startsWith('pos_guest='))).toBe(true)

    const menuHandler = (await import('../../server/api/menu/index.get')).default
    const { event: ev } = makeEvent({ method: 'GET' })
    const menu = await menuHandler(ev) as { items: Array<{ nameDe: string; isAvailable: boolean }> }
    expect(menu.items.every((i) => i.isAvailable)).toBe(true)
    expect(menu.items.find((i) => i.nameDe === 'Wasser')).toBeUndefined()
  })

  it('scenario 3: idempotent submit returns same orderId', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const session = await createGuest(5)
    const csrf = { csrf: 'a'.repeat(64) }
    const headers = { 'x-csrf-token': 'a'.repeat(64), 'idempotency-key': 'k-1' }
    ctx.setBody({ tableNo: 5, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] })
    const orderHandler = (await import('../../server/api/orders/index.post')).default
    const e1 = makeEvent({ method: 'POST', cookies: csrf, headers })
    e1.event.context.guest = { sessionId: session.result.sessionId, eventId: seeded.eventId, tableNo: 5 }
    const r1 = await orderHandler(e1.event) as { orderId: string }
    const e2 = makeEvent({ method: 'POST', cookies: csrf, headers })
    e2.event.context.guest = { sessionId: session.result.sessionId, eventId: seeded.eventId, tableNo: 5 }
    const r2 = await orderHandler(e2.event) as { orderId: string }
    expect(r1.orderId).toBe(r2.orderId)
  })

  it('scenario 5: same-table privacy — guest A does not see guest B items via /api/orders/session', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const a = await createGuest(7)
    const b = await createGuest(7)
    const csrf = { csrf: 'a'.repeat(64) }
    const headers = { 'x-csrf-token': 'a'.repeat(64) }
    const orderHandler = (await import('../../server/api/orders/index.post')).default
    // A orders
    ctx.setBody({ tableNo: 7, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 2 }] })
    const eA = makeEvent({ method: 'POST', cookies: csrf, headers })
    eA.event.context.guest = { sessionId: a.result.sessionId, eventId: seeded.eventId, tableNo: 7 }
    await orderHandler(eA.event)
    // B orders
    ctx.setBody({ tableNo: 7, items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 1 }] })
    const eB = makeEvent({ method: 'POST', cookies: csrf, headers })
    eB.event.context.guest = { sessionId: b.result.sessionId, eventId: seeded.eventId, tableNo: 7 }
    await orderHandler(eB.event)

    const sessHandler = (await import('../../server/api/orders/session.get')).default
    const { event: evA } = makeEvent({ method: 'GET' })
    evA.context.guest = { sessionId: a.result.sessionId, eventId: seeded.eventId, tableNo: 7 }
    const aView = await sessHandler(evA) as { items: unknown[]; tableBalanceCents: number }
    expect(aView.items.length).toBe(1)
    expect(aView.tableBalanceCents).toBe(2 * 350 + 1 * 400)
  })

  it('scenario 6: reload preserves session — me endpoint returns the same session', async () => {
    // Simulate cookie round-trip by importing me handler.
    const session = await createGuest(11)
    const { makeEvent } = await import('../setup/h3-event')
    const meHandler = (await import('../../server/api/session/me.get')).default
    const { event } = makeEvent({ method: 'GET' })
    event.context.guest = { sessionId: session.result.sessionId, eventId: seeded.eventId, tableNo: 11 }
    const me = await meHandler(event) as { sessionId: string; tableNo: number }
    expect(me.sessionId).toBe(session.result.sessionId)
    expect(me.tableNo).toBe(11)
  })

  it('rejects table number outside event range (FR-002)', async () => {
    await expect(createGuest(99)).rejects.toThrow(/range|99/)
  })
})
