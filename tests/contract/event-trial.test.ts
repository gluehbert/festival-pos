import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'
import type { Db } from '../../server/db/client'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

function adminEvent(method: string, id: string | null, role: 'admin' | 'waiter' = 'admin') {
  const { event } = makeEvent({ method, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'a' } }
  if (id) event.context.params = { id }
  return event
}

async function setTrial(enabled: boolean) {
  const handler = (await import('../../server/api/admin/events/[id]/trial.put')).default
  ctx.setBody({ enabled })
  return await handler(adminEvent('PUT', seeded.eventId)) as { trialMode: boolean; trialOrders: number }
}

async function guestOrderAndPay(): Promise<void> {
  const orders = (await import('../../server/api/orders/index.post')).default
  ctx.setBody({ tableNo: 3, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 2 }] })
  const { event } = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.guest = ctx.guest
  const order = await orders(event) as { items: Array<{ orderItemId: string }> }

  const payments = (await import('../../server/api/payments/index.post')).default
  ctx.setBody({ ticketKey: 't-3', orderItemIds: order.items.map((i) => i.orderItemId) })
  await payments(adminEvent('POST', null, 'waiter'))
}

async function walkinOrder(): Promise<void> {
  const orders = (await import('../../server/api/orders/index.post')).default
  ctx.setBody({ tableNo: 5, createWalkin: true, items: [{ menuItemId: seeded.menuItemIds[1]!, quantity: 1 }] })
  await orders(adminEvent('POST', null, 'waiter'))
}

describe('rehearsal mode', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    const guestId = (ctx.mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${seeded.eventId}', 3, now() + interval '7 days') RETURNING id`,
    ) as { id: string }).id
    ctx.setGuest({ sessionId: guestId, eventId: seeded.eventId, tableNo: 3 })
  })

  it('flags orders and payments, keeps them out of reports and deletes only test data', async () => {
    await guestOrderAndPay() // real
    expect(await setTrial(true)).toMatchObject({ trialMode: true, trialOrders: 0 })
    await guestOrderAndPay() // test
    await walkinOrder() // test

    expect(ctx.mem.public.many(`SELECT is_trial FROM orders ORDER BY created_at`)).toEqual([
      { is_trial: false }, { is_trial: true }, { is_trial: true },
    ])
    expect(ctx.mem.public.many(`SELECT is_trial FROM payments ORDER BY created_at`)).toEqual([
      { is_trial: false }, { is_trial: true },
    ])

    const reports = await import('../../server/lib/reports')
    const db = ctx.db as unknown as Db
    expect(await reports.loadRevenueByCategory(db, seeded.eventId)).toEqual([{ category: 'food', totalCents: 700, itemCount: 2 }])
    expect(await reports.loadPaymentsByStaff(db, seeded.eventId)).toMatchObject([{ paymentCount: 1, totalCents: 700 }])
    expect((await reports.loadOrdersPerHour(db, seeded.eventId)).reduce((n, r) => n + r.orderCount, 0)).toBe(1)
    expect((await reports.loadTopItems(db, seeded.eventId)).map((r) => r.nameDe)).toEqual(['Pommes'])

    const list = (await import('../../server/api/admin/events/index.get')).default
    expect(await list(adminEvent('GET', null))).toMatchObject({ events: [{ trialMode: true, trialOrders: 2 }] })

    const reset = (await import('../../server/api/admin/events/[id]/trial-data.delete')).default
    await expect(reset(adminEvent('DELETE', seeded.eventId))).resolves.toMatchObject({
      deletedOrders: 2,
      deletedPayments: 1,
      event: { trialMode: true, trialOrders: 0 },
    })
    expect(ctx.mem.public.many(`SELECT is_trial FROM orders`)).toEqual([{ is_trial: false }])
    expect(ctx.mem.public.many(`SELECT is_trial, total_cents FROM payments`)).toEqual([{ is_trial: false, total_cents: 700 }])
    expect(ctx.mem.public.one(`SELECT count(*)::int AS n FROM order_items`)).toEqual({ n: 1 })
    expect(ctx.mem.public.one(`SELECT count(*)::int AS n FROM payment_items`)).toEqual({ n: 1 })

    expect(await setTrial(false)).toMatchObject({ trialMode: false })
    await walkinOrder()
    expect(ctx.mem.public.many(`SELECT is_trial FROM orders WHERE created_by_staff IS NOT NULL`)).toEqual([{ is_trial: false }])
    // Switching the mode twice, deleting the test data once: own actions.
    expect(ctx.mem.public.one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'event_trial'`)).toEqual({ n: 2 })
    expect(ctx.mem.public.one(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'event_trial_data_delete'`)).toEqual({ n: 1 })
  })

  it('takes the payment flag from the paid orders and refuses to mix test and real items', async () => {
    const orders = (await import('../../server/api/orders/index.post')).default
    const payments = (await import('../../server/api/payments/index.post')).default
    const order = async () => {
      ctx.setBody({ tableNo: 3, items: [{ menuItemId: seeded.menuItemIds[0]!, quantity: 1 }] })
      const { event } = makeEvent({ method: 'POST', cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
      event.context.guest = ctx.guest
      return ((await orders(event)) as { items: Array<{ orderItemId: string }> }).items[0]!.orderItemId
    }
    const pay = (ids: string[]) => {
      ctx.setBody({ ticketKey: 't-3', orderItemIds: ids })
      return payments(adminEvent('POST', null, 'waiter'))
    }

    const real = await order() // before the rehearsal
    await setTrial(true)
    const test = await order()
    await expect(pay([real, test])).rejects.toMatchObject({ statusCode: 400 })
    await pay([real])
    await pay([test])
    expect(ctx.mem.public.many(`SELECT is_trial FROM payments ORDER BY created_at`)).toEqual([{ is_trial: false }, { is_trial: true }])

    const reset = (await import('../../server/api/admin/events/[id]/trial-data.delete')).default
    await reset(adminEvent('DELETE', seeded.eventId))
    expect(ctx.mem.public.many(`SELECT total_cents FROM payments`)).toEqual([{ total_cents: 350 }])
  })

  it('shows the rehearsal flag to guests via the public branding', async () => {
    const branding = (await import('../../server/api/event/branding.get')).default
    await setTrial(true)
    const { event, getHeader } = makeEvent({ method: 'GET' })
    await expect(branding(event)).resolves.toMatchObject({ trialMode: true })
    expect(getHeader('cache-control')).toBe('no-cache')
  })

  it('rejects non-admins, bad ids, unknown events and invalid bodies', async () => {
    const toggle = (await import('../../server/api/admin/events/[id]/trial.put')).default
    const reset = (await import('../../server/api/admin/events/[id]/trial-data.delete')).default
    ctx.setBody({ enabled: true })
    await expect(toggle(adminEvent('PUT', seeded.eventId, 'waiter'))).rejects.toMatchObject({ statusCode: 403 })
    await expect(reset(adminEvent('DELETE', seeded.eventId, 'waiter'))).rejects.toMatchObject({ statusCode: 403 })
    await expect(toggle(adminEvent('PUT', 'nope'))).rejects.toMatchObject({ statusCode: 400 })
    await expect(reset(adminEvent('DELETE', 'nope'))).rejects.toMatchObject({ statusCode: 400 })
    const unknown = '00000000-0000-4000-8000-000000000000'
    await expect(toggle(adminEvent('PUT', unknown))).rejects.toMatchObject({ statusCode: 404 })
    await expect(reset(adminEvent('DELETE', unknown))).rejects.toMatchObject({ statusCode: 404 })
    ctx.setBody({ enabled: 'yes' })
    await expect(toggle(adminEvent('PUT', seeded.eventId))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('event dates', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('stores dates on create, sorts the list by date and validates them', async () => {
    const create = (await import('../../server/api/admin/events/index.post')).default
    const base = { tableRangeFrom: 1, tableRangeTo: 10 }
    ctx.setBody({ ...base, name: 'Sommerfest', pinCode: 'SOMMER', startsOn: '2026-06-13', endsOn: '2026-06-14' })
    await expect(create(adminEvent('POST', null))).resolves.toMatchObject({ startsOn: '2026-06-13', endsOn: '2026-06-14', trialMode: false, trialOrders: 0 })
    ctx.setBody({ ...base, name: 'Herbstfest', pinCode: 'HERBST', startsOn: '2026-09-19', endsOn: '' })
    await expect(create(adminEvent('POST', null))).resolves.toMatchObject({ startsOn: '2026-09-19', endsOn: null })

    for (const bad of [{ startsOn: '2026-06-14', endsOn: '2026-06-13' }, { startsOn: '2026-02-30' }, { startsOn: '13.06.2026' }]) {
      ctx.setBody({ ...base, name: 'X', pinCode: 'XXXX', ...bad })
      await expect(create(adminEvent('POST', null))).rejects.toMatchObject({ statusCode: 400 })
    }

    const list = (await import('../../server/api/admin/events/index.get')).default
    const res = await list(adminEvent('GET', null)) as { events: Array<{ name: string }> }
    expect(res.events.map((e) => e.name)).toEqual(['Herbstfest', 'Sommerfest', 'Demo'])
  })

  it('edits dates via the branding form and shows them publicly', async () => {
    const patch = (await import('../../server/api/admin/events/[id]/branding.patch')).default
    ctx.setBody({ startsOn: '2026-06-13', endsOn: '2026-06-14' })
    await expect(patch(adminEvent('PATCH', seeded.eventId))).resolves.toMatchObject({ startsOn: '2026-06-13', endsOn: '2026-06-14' })
    // Only the end date sent: still checked against the stored start date.
    ctx.setBody({ endsOn: '2026-06-01' })
    await expect(patch(adminEvent('PATCH', seeded.eventId))).rejects.toMatchObject({ statusCode: 400 })
    ctx.setBody({ endsOn: '' })
    await expect(patch(adminEvent('PATCH', seeded.eventId))).resolves.toMatchObject({ startsOn: '2026-06-13', endsOn: null })

    const branding = (await import('../../server/api/event/branding.get')).default
    await expect(branding(makeEvent({ method: 'GET' }).event)).resolves.toMatchObject({ startsOn: '2026-06-13', endsOn: null, trialMode: false })
  })
})
