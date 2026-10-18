import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

function adminAuth(staffId: string) {
  return { staff: { staffId, role: 'admin' as const, username: 'admin' } }
}

async function run(qs: string): Promise<{
  status: number
  body: unknown
  contentType?: string | string[]
  event: import('h3').H3Event
}> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/admin/events/[id]/reports.get')).default
  const { event, getHeader } = makeEvent({ method: 'GET', url: `/api/admin/events/${seeded.eventId}/reports${qs}` })
  event.context.auth = adminAuth(seeded.staffId)
  event.context.params = { id: seeded.eventId }
  const res = await handler(event)
  return {
    status: event.node.res.statusCode,
    body: res,
    contentType: getHeader('content-type'),
    event,
  }
}

function seedMinimalOrder() {
  const guestId = (ctx.mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${seeded.eventId}', 3, now() + interval '1 day') RETURNING id`,
  ) as { id: string }).id
  const orderId = (ctx.mem.public.one(
    `INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${seeded.eventId}', 3, '${guestId}') RETURNING id`,
  ) as { id: string }).id
  ctx.mem.public.none(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, station)
     VALUES ('${orderId}', '${seeded.menuItemIds[0]}', 2, 350, 'kitchen')`,
  )
  return { orderId }
}

describe('GET /api/admin/events/{id}/reports — contract', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
    seedMinimalOrder()
  })

  it('ReportQuerySchema validates and rejects bad types', async () => {
    const { ReportQuerySchema } = await import('../../server/lib/contracts/reports')
    expect(ReportQuerySchema.parse({ type: 'voids' }).format).toBe('json')
    expect(() => ReportQuerySchema.parse({ type: 'unknown' })).toThrow()
    expect(() => ReportQuerySchema.parse({ type: 'voids', format: 'xml' })).toThrow()
  })

  it.each([
    'revenue_by_category',
    'top_items',
    'voids',
    'payments_by_staff',
    'tips',
    'orders_per_hour',
    'app_usage',
  ] as const)('JSON envelope validates ReportSchema for %s', async (type) => {
    const { ReportSchema } = await import('../../server/lib/contracts/reports')
    const r = await run(`?type=${type}`)
    expect(r.status).toBe(200)
    expect(() => ReportSchema.parse(r.body)).not.toThrow()
    const parsed = ReportSchema.parse(r.body)
    expect(parsed.type).toBe(type)
    expect(parsed.eventId).toBe(seeded.eventId)
  })

  it('CSV returns text/csv; charset=utf-8 + BOM + semicolon-separated', async () => {
    const r = await run('?type=revenue_by_category&format=csv')
    expect(r.status).toBe(200)
    expect(r.contentType).toBe('text/csv; charset=utf-8')
    expect(typeof r.body).toBe('string')
    const body = r.body as string
    expect(body.charCodeAt(0)).toBe(0xfeff)
    const firstLine = body.slice(1).split(/\r?\n/)[0]!
    expect(firstLine.split(';')).toEqual(['category', 'totalCents', 'itemCount'])
  })

  it('CSV headers per report type match schema', async () => {
    const cases: Array<[string, string[]]> = [
      ['top_items', ['menuItemId', 'nameDe', 'nameEn', 'quantity', 'totalCents']],
      ['voids', ['orderItemId', 'nameDe', 'nameEn', 'reason', 'voidedAt', 'voidedByStaffId', 'refundedCents']],
      ['payments_by_staff', ['staffId', 'username', 'paymentCount', 'totalCents', 'refundedCents', 'tipCents']],
      ['tips', ['staffId', 'username', 'paymentCount', 'tipCents']],
      ['orders_per_hour', ['hourEuropeBerlin', 'orderCount', 'guestOrderCount']],
      ['app_usage', ['tableNo', 'scans', 'orderingDevices', 'guestOrders', 'staffOrders', 'guestItems', 'staffItems']],
    ]
    for (const [type, header] of cases) {
      const r = await run(`?type=${type}&format=csv`)
      const body = r.body as string
      expect(body.charCodeAt(0)).toBe(0xfeff)
      const firstLine = body.slice(1).split(/\r?\n/)[0]!
      expect(firstLine.split(';')).toEqual(header)
    }
  })

  it('CSV writes the Berlin hour in a spreadsheet-friendly form', async () => {
    const { reportToCsv } = await import('../../server/lib/reports-csv')
    const csv = reportToCsv('orders_per_hour', [{ hour: '2026-07-04T18:00', orderCount: 4, guestOrderCount: 3 }])
    expect(csv.slice(1).split('\r\n')).toEqual(['hourEuropeBerlin;orderCount;guestOrderCount', '2026-07-04 18:00;4;3', ''])
  })

  it('requires admin role', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/reports.get')).default
    const { event } = makeEvent({ method: 'GET', url: `/api/admin/events/${seeded.eventId}/reports?type=voids` })
    event.context.params = { id: seeded.eventId }
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })
})
