import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

const CSRF = 'a'.repeat(64)
type Role = 'waiter' | 'admin' | 'kitchen' | 'bar'

async function call(
  route: string,
  opts: { role: Role; method?: string; body?: unknown; params?: Record<string, string> },
): Promise<unknown> {
  const { makeEvent } = await import('../setup/h3-event')
  const method = opts.method ?? 'POST'
  if (opts.body !== undefined) ctx.setBody(opts.body)
  const handler = (await import(`../../server/api/${route}`)).default
  const { event } = makeEvent({ method, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.auth = { staff: { staffId: seeded.staffId, role: opts.role, username: 'u' } }
  event.context.params = opts.params ?? {}
  return await handler(event)
}

const POMMES = () => seeded.menuItemIds[0]!
const BIER = () => seeded.menuItemIds[1]!

async function waiterOrder(tableNo: number, mode: 'staff_table' | 'walkin' = 'staff_table') {
  return await call('orders/index.post', {
    role: 'waiter',
    body: { tableNo, mode, items: [{ menuItemId: POMMES(), quantity: 2 }, { menuItemId: BIER(), quantity: 1 }] },
  }) as { orderId: string; items: Array<{ orderItemId: string; menuItemId: string }> }
}

type Summary = { ticketKey: string; status: string; ready: { kitchen: number; bar: number; cafe: number } }
async function openTickets(): Promise<Summary[]> {
  return (await call('tickets/index.get', { role: 'waiter', method: 'GET' }) as { tickets: Summary[] }).tickets
}

describe('US7 kitchen/bar finish whole orders, waiter sees what is ready — integration', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('queue items carry the order kind', async () => {
    await waiterOrder(5)
    await waiterOrder(0, 'walkin')
    const q = await call('production/queue.get', { role: 'kitchen', method: 'GET' }) as {
      items: Array<{ tableNo: number; orderKind: string }>
    }
    expect(q.items.map((i) => [i.tableNo, i.orderKind])).toEqual([[5, 'staff_table'], [0, 'walkin']])
  })

  it('finishes all open items of the own station only, then the waiter brings them', async () => {
    const order = await waiterOrder(5)
    const done = await call('production/orders/[id]/done.post', { role: 'kitchen', body: {}, params: { id: order.orderId } }) as {
      doneItemIds: string[]
    }
    const pommesLine = order.items.find((i) => i.menuItemId === POMMES())!
    expect(done.doneItemIds).toEqual([pommesLine.orderItemId])

    const barQueue = await call('production/queue.get', { role: 'bar', method: 'GET' }) as { items: unknown[] }
    expect(barQueue.items).toHaveLength(1)
    expect((await openTickets())[0]!.ready).toEqual({ kitchen: 2, bar: 0, cafe: 0 })

    // Twice is harmless: nothing left to finish.
    const again = await call('production/orders/[id]/done.post', { role: 'kitchen', body: {}, params: { id: order.orderId } }) as {
      doneItemIds: string[]
    }
    expect(again.doneItemIds).toEqual([])

    const served = await call('tickets/[id]/served.post', { role: 'waiter', body: {}, params: { id: 't-5' } }) as {
      servedItemIds: string[]
    }
    expect(served.servedItemIds).toEqual([pommesLine.orderItemId])
    expect((await openTickets())[0]!.ready).toEqual({ kitchen: 0, bar: 0, cafe: 0 })

    const detail = await call('tickets/[id].get', { role: 'waiter', method: 'GET', params: { id: 't-5' } }) as {
      items: Array<{ orderItemId: string; served: boolean }>
    }
    expect(detail.items.find((i) => i.orderItemId === pommesLine.orderItemId)!.served).toBe(true)

    await call('production/orders/[id]/done.post', { role: 'bar', body: {}, params: { id: order.orderId } })
    expect((await openTickets())[0]!.ready).toEqual({ kitchen: 0, bar: 1, cafe: 0 })
  })

  it('guards roles and ids', async () => {
    const order = await waiterOrder(5)
    const params = { id: order.orderId }
    await expect(call('production/orders/[id]/done.post', { role: 'kitchen', body: { station: 'bar' }, params }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(call('production/orders/[id]/done.post', { role: 'waiter', body: {}, params }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(call('production/orders/[id]/done.post', { role: 'admin', body: {}, params }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(call('production/orders/[id]/done.post', { role: 'kitchen', body: {}, params: { id: 'nope' } }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(call('production/orders/[id]/done.post', {
      role: 'kitchen', body: {}, params: { id: '00000000-0000-4000-8000-000000000000' },
    })).rejects.toMatchObject({ statusCode: 404 })
    await expect(call('tickets/[id]/served.post', { role: 'kitchen', body: {}, params: { id: 't-5' } }))
      .rejects.toMatchObject({ statusCode: 403 })

    const admin = await call('production/orders/[id]/done.post', { role: 'admin', body: { station: 'bar' }, params }) as {
      doneItemIds: string[]
    }
    expect(admin.doneItemIds).toHaveLength(1)
  })

  it('keeps a paid walk-in listed while its food still has to be handed out', async () => {
    const walk = await waiterOrder(0, 'walkin')
    const key = `w-${walk.orderId}`
    await call('payments/index.post', { role: 'waiter', body: { ticketKey: key, orderItemIds: walk.items.map((i) => i.orderItemId) } })
    expect((await openTickets()).map((t) => t.ticketKey)).toEqual([])

    await call('production/orders/[id]/done.post', { role: 'kitchen', body: {}, params: { id: walk.orderId } })
    expect(await openTickets()).toMatchObject([{ ticketKey: key, status: 'paid', ready: { kitchen: 2, bar: 0, cafe: 0 } }])

    await call('tickets/[id]/served.post', { role: 'waiter', body: { station: 'kitchen' }, params: { id: key } })
    expect(await openTickets()).toEqual([])
  })
})
