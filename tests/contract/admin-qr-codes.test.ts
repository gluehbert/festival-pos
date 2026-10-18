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

async function fetchPdf(qs: string): Promise<{ status: number; bytes: Buffer; contentType?: string | string[] }> {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/admin/events/[id]/qr-codes.get')).default
  const { event, getHeader } = makeEvent({ method: 'GET', url: `/api/admin/events/${seeded.eventId}/qr-codes${qs}` })
  event.context.auth = adminAuth(seeded.staffId)
  event.context.params = { id: seeded.eventId }
  const r = (await handler(event)) as Buffer
  return {
    status: event.node.res.statusCode,
    bytes: r,
    contentType: getHeader('content-type'),
  }
}

async function countPdfPages(buf: Buffer): Promise<number> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(buf)
  return doc.getPageCount()
}

describe('GET /api/admin/events/{id}/qr-codes', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 50 })
  })

  it('QrRangeQuerySchema validates', async () => {
    const { QrRangeQuerySchema } = await import('../../server/lib/contracts/admin')
    expect(() => QrRangeQuerySchema.parse({ from: 1, to: 5 })).not.toThrow()
    expect(() => QrRangeQuerySchema.parse({ from: '5', to: '10' })).not.toThrow()
    expect(() => QrRangeQuerySchema.parse({ from: 10, to: 5 })).toThrow()
    expect(() => QrRangeQuerySchema.parse({ from: 0, to: 5 })).toThrow()
  })

  it('range 1-24 yields a single-page PDF', async () => {
    const r = await fetchPdf('?from=1&to=24')
    expect(r.contentType).toBe('application/pdf')
    expect(r.bytes.length).toBeGreaterThan(500)
    expect(r.bytes.slice(0, 5).toString('ascii')).toBe('%PDF-')
    expect(await countPdfPages(r.bytes)).toBe(1)
  }, 20000)

  it('range 1-48 yields a two-page PDF (4x6 grid)', async () => {
    const r = await fetchPdf('?from=1&to=48')
    expect(r.contentType).toBe('application/pdf')
    expect(r.bytes.slice(0, 5).toString('ascii')).toBe('%PDF-')
    expect(await countPdfPages(r.bytes)).toBe(2)
  }, 30000)

  it('rejects range outside event range with 400', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/qr-codes.get')).default
    const { event } = makeEvent({ method: 'GET', url: `/api/admin/events/${seeded.eventId}/qr-codes?from=1&to=999` })
    event.context.auth = adminAuth(seeded.staffId)
    event.context.params = { id: seeded.eventId }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('404 for an unknown event', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/qr-codes.get')).default
    const id = '00000000-0000-4000-8000-0000000000ff'
    const { event } = makeEvent({ method: 'GET', url: `/api/admin/events/${id}/qr-codes?from=1&to=5` })
    event.context.auth = adminAuth(seeded.staffId)
    event.context.params = { id }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('requires admin role', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const handler = (await import('../../server/api/admin/events/[id]/qr-codes.get')).default
    const { event } = makeEvent({ method: 'GET', url: `/api/admin/events/${seeded.eventId}/qr-codes?from=1&to=5` })
    event.context.params = { id: seeded.eventId }
    event.context.auth = { staff: { staffId: seeded.staffId, role: 'waiter', username: 'w' } }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  })
})
