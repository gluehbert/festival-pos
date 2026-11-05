import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import de from '../../app/i18n/de.json'
import en from '../../app/i18n/en.json'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

async function download(role: 'admin' | 'waiter' = 'admin') {
  const { makeEvent } = await import('../setup/h3-event')
  const handler = (await import('../../server/api/admin/events/[id]/cheat-sheet.get')).default
  const { event, getHeader } = makeEvent({ method: 'GET', url: `/api/admin/events/${seeded.eventId}/cheat-sheet?lang=de` })
  event.context.auth = { staff: { staffId: seeded.staffId, role, username: 'admin' } }
  event.context.params = { id: seeded.eventId }
  const bytes = (await handler(event)) as Buffer
  return { bytes, contentType: getHeader('content-type') }
}

const pages = async (buf: Buffer) => (await (await import('pdf-lib')).PDFDocument.load(buf)).getPageCount()

describe('GET /api/admin/events/{id}/cheat-sheet', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem, { tableRangeFrom: 1, tableRangeTo: 20 })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has one A4 page per role and the join link as QR code', async () => {
    ctx.mem.public.none(`UPDATE events SET join_code = 'joinme123' WHERE id = '${seeded.eventId}'`)
    const qr = vi.spyOn(QRCode, 'toDataURL')
    const r = await download()
    expect(r.contentType).toBe('application/pdf')
    expect(await pages(r.bytes)).toBe(5)
    expect(qr).toHaveBeenCalledTimes(1)
    expect(String(qr.mock.calls[0]![0])).toMatch(/\/staff\/join\/joinme123$/)
  }, 20000)

  it('still prints all pages without a join link, just without the QR code', async () => {
    const qr = vi.spyOn(QRCode, 'toDataURL')
    expect(await pages((await download()).bytes)).toBe(5)
    expect(qr).not.toHaveBeenCalled()
  }, 20000)

  it('is for admins only', async () => {
    await expect(download('waiter')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('cheat sheet texts', () => {
  it('uses the same steps the app shows under "So geht’s"', async () => {
    const { cheatSheetTexts } = await import('../../server/lib/cheat-sheet-pdf')
    const t = cheatSheetTexts('de')
    expect(Object.values(t).map((s) => s.title)).toEqual(['Bedienung', 'Küche', 'Bar', 'Kuchentheke', 'Schichtleitung'])
    expect(t.waiter.steps.map((s) => s.text)).toEqual([de.staff.welcome.order.text, de.staff.welcome.bring.text, de.staff.welcome.pay.text])
    expect(t.kitchen.steps.map((s) => s.text)).toEqual([de.production.guide.arrive, de.production.guide.start, de.production.guide.done])
    expect(t.cafe.steps.at(-1)!.text).toBe(de.production.guide.cafeClose)
    for (const sheet of Object.values(t)) {
      expect(sheet.steps).toHaveLength(3)
      expect(sheet.faq.length).toBeGreaterThanOrEqual(3)
    }
    expect(cheatSheetTexts('en').waiter.title).toBe(en.admin.cheatSheet.roles.waiter)
  })
})
