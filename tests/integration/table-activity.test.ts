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
  opts: { role: Role; method?: string; body?: unknown; params?: Record<string, string>; csrf?: boolean },
): Promise<unknown> {
  const { makeEvent } = await import('../setup/h3-event')
  const method = opts.method ?? 'POST'
  if (opts.body !== undefined) ctx.setBody(opts.body)
  const handler = (await import(`../../server/api/${route}`)).default
  const csrf = opts.csrf === false ? {} : { cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } }
  const { event } = makeEvent({ method, ...csrf })
  event.context.auth = { staff: { staffId: seeded.staffId, role: opts.role, username: 'u' } }
  event.context.params = opts.params ?? {}
  return await handler(event)
}

async function waiterOrder(tableNo: number, mode: 'staff_table' | 'walkin' = 'staff_table') {
  return await call('orders/index.post', {
    role: 'waiter',
    body: { tableNo, mode, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] },
  }) as { orderId: string }
}

// Moves an order (and its items) into the past.
function backdate(orderId: string, minutes: number) {
  const at = new Date(Date.now() - minutes * 60_000).toISOString()
  ctx.mem.public.none(`UPDATE orders SET created_at = '${at}' WHERE id = '${orderId}'`)
  ctx.mem.public.none(`UPDATE order_items SET created_at = '${at}' WHERE order_id = '${orderId}'`)
}

type Summary = { ticketKey: string; lastOrderAt: string; lastCheckAt: string | null }
async function list(): Promise<{ tickets: Summary[]; serverNow: string }> {
  return await call('tickets/index.get', { role: 'waiter', method: 'GET' }) as { tickets: Summary[]; serverNow: string }
}

const minutesAgo = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / 60_000)

describe('time since the last order and "asked, nothing wanted"', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })

  it('reports the newest order per table and the server clock', async () => {
    const first = await waiterOrder(3)
    const second = await waiterOrder(3)
    backdate(first.orderId, 40)
    backdate(second.orderId, 25)

    const res = await list()
    expect(Math.abs(Date.parse(res.serverNow) - Date.now())).toBeLessThan(5_000)
    const t3 = res.tickets.find((t) => t.ticketKey === 't-3')!
    expect(minutesAgo(t3.lastOrderAt)).toBe(25)
    expect(t3.lastCheckAt).toBeNull()

    const detail = await call('tickets/[id].get', { role: 'waiter', method: 'GET', params: { id: 't-3' } }) as Summary & { serverNow: string }
    expect(minutesAgo(detail.lastOrderAt)).toBe(25)
    expect(detail.lastCheckAt).toBeNull()
    expect(detail.serverNow).toBeTruthy()
  })

  it('records a check per table and overwrites it on the next one', async () => {
    const o = await waiterOrder(4)
    backdate(o.orderId, 30)
    await waiterOrder(6)

    const r1 = await call('tickets/[id]/checked.post', { role: 'waiter', body: {}, params: { id: 't-4' } }) as { ticketKey: string; checkedAt: string }
    expect(r1.ticketKey).toBe('t-4')
    ctx.mem.public.none(`UPDATE table_checks SET checked_at = now() - interval '10 minutes'`)
    await call('tickets/[id]/checked.post', { role: 'admin', body: {}, params: { id: 't-4' } })

    expect((ctx.mem.public.many(`SELECT * FROM table_checks`) as unknown[]).length).toBe(1)
    const tickets = (await list()).tickets
    const t4 = tickets.find((t) => t.ticketKey === 't-4')!
    expect(minutesAgo(t4.lastCheckAt!)).toBe(0)
    expect(tickets.find((t) => t.ticketKey === 't-6')!.lastCheckAt).toBeNull()

    const detail = await call('tickets/[id].get', { role: 'waiter', method: 'GET', params: { id: 't-4' } }) as Summary
    expect(detail.lastCheckAt).toBe(t4.lastCheckAt)
  })

  it('leaves walk-ins without a check', async () => {
    const walk = await waiterOrder(0, 'walkin')
    const t = (await list()).tickets.find((x) => x.ticketKey === `w-${walk.orderId}`)!
    expect(t.lastCheckAt).toBeNull()
    expect(t.lastOrderAt).toBeTruthy()
  })

  it('guards role, CSRF, key and table range', async () => {
    const params = { id: 't-4' }
    await expect(call('tickets/[id]/checked.post', { role: 'kitchen', body: {}, params })).rejects.toMatchObject({ statusCode: 403 })
    await expect(call('tickets/[id]/checked.post', { role: 'waiter', body: {}, params, csrf: false })).rejects.toMatchObject({ statusCode: 403 })
    await expect(call('tickets/[id]/checked.post', { role: 'waiter', body: {}, params: { id: 'w-00000000-0000-4000-8000-000000000000' } }))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(call('tickets/[id]/checked.post', { role: 'waiter', body: {}, params: { id: 't-99' } })).rejects.toMatchObject({ statusCode: 400 })
    await expect(call('tickets/[id]/checked.post', { role: 'waiter', body: {}, params: { id: 'nope' } })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('clears checks when the rehearsal ends', async () => {
    await call('tickets/[id]/checked.post', { role: 'waiter', body: {}, params: { id: 't-2' } })
    const { resetTableState } = await import('../../server/lib/events')
    const { getDb } = await import('../../server/db/client')
    await resetTableState(getDb(), seeded.eventId)
    expect((ctx.mem.public.many(`SELECT * FROM table_checks`) as unknown[]).length).toBe(0)
  })
})
