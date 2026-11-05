import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const admin = () => ({ staffId: seeded.staffId, role: 'admin' as const })
const create = (body: Record<string, unknown>) => call<{ id: string; depositEnabled: boolean; guestOpenLimitBarCents: number | null }>(
  '../../server/api/admin/events/index.post',
  { method: 'POST', staff: admin(), body: { name: 'Sommerfest 2027', pinCode: 'SOMMER27', tableRangeFrom: 1, tableRangeTo: 30, ...body } },
)
const one = <T>(q: string) => ctx.mem.public.one(q) as T
const many = <T>(q: string) => ctx.mem.public.many(q) as T[]

describe('a new event set up like last year\'s', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    const [first, second] = seeded.menuItemIds
    ctx.mem.public.none(`UPDATE events SET accent_color = '#123456', welcome_text = 'Willkommen', deposit_enabled = true, guest_open_limit_bar_cents = 3000 WHERE id = '${seeded.eventId}'`)
    ctx.mem.public.none(`UPDATE menu_items SET stock = 0, is_available = false WHERE id = '${first}'`)
    ctx.mem.public.none(`UPDATE menu_items SET archived_at = now() WHERE id = '${second}'`)
    ctx.mem.public.none(`INSERT INTO price_rules (event_id, name, start_minute, end_minute, valid_from, valid_to, menu_item_ids, kind, value)
      VALUES ('${seeded.eventId}', 'Happy Hour', 1020, 1080, '2026-06-13', '2026-06-14', '["${first}","${second}"]', 'percent', 20)`)
    ctx.mem.public.none(`INSERT INTO station_buzzers (event_id, station, lane, key) VALUES ('${seeded.eventId}', 'kitchen', 1, 'F9')`)
  })

  it('copies look, features, the current menu, price rules and buzzers', async () => {
    const res = await create({ copyFromId: seeded.eventId })
    expect(res.status).toBe(201)
    const id = res.body.id
    expect(res.body).toMatchObject({ depositEnabled: true, guestOpenLimitBarCents: 3000 })
    expect(one<{ accent_color: string; welcome_text: string; pin_code: string; table_range_to: number }>(
      `SELECT accent_color, welcome_text, pin_code, table_range_to FROM events WHERE id = '${id}'`,
    )).toEqual({ accent_color: '#123456', welcome_text: 'Willkommen', pin_code: 'SOMMER27', table_range_to: 30 })

    // The archived item stays behind; sold-out marks and stock do not carry over.
    const items = many<{ id: string; stock: number | null; is_available: boolean }>(`SELECT id, stock, is_available FROM menu_items WHERE event_id = '${id}'`)
    const before = many<{ n: number }>(`SELECT id FROM menu_items WHERE event_id = '${seeded.eventId}' AND archived_at IS NULL`).length
    expect(items).toHaveLength(before)
    expect(items.every((i) => i.stock === null && i.is_available)).toBe(true)

    const rule = one<{ valid_from: string | null; menu_item_ids: string[] }>(`SELECT valid_from, menu_item_ids FROM price_rules WHERE event_id = '${id}'`)
    expect(rule.valid_from).toBeNull()
    expect(rule.menu_item_ids).toHaveLength(1)
    expect(items.map((i) => i.id)).toContain(rule.menu_item_ids[0])

    expect(many(`SELECT key FROM station_buzzers WHERE event_id = '${id}'`)).toEqual([{ key: 'F9' }])
    // The source is untouched.
    expect(many(`SELECT id FROM menu_items WHERE event_id = '${seeded.eventId}'`)).toHaveLength(seeded.menuItemIds.length)
  })

  it('starts empty without a source, and refuses an unknown one', async () => {
    const empty = await create({})
    expect(empty.status).toBe(201)
    expect(many(`SELECT id FROM menu_items WHERE event_id = '${empty.body.id}'`)).toHaveLength(0)

    const bad = await create({ pinCode: 'OTHER27', copyFromId: '00000000-0000-4000-8000-00000000dead' })
    expect(bad.status).toBe(404)
    expect(many(`SELECT id FROM events WHERE pin_code = 'OTHER27'`)).toHaveLength(0)
  })
})
