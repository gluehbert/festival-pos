import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { call, insertStaff } from '../setup/call'

beforeAll(async () => {
  await installCommonMocks()
})

let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }
const SESSION = '../../server/api/cash/session'

describe('cash close uses the database clock', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
  })

  it('counts a payment booked just before closing and freezes closed_at from the database', async () => {
    const staffId = insertStaff('waiter', 'anna')
    const waiter = { staffId, role: 'waiter' as const, username: 'anna' }
    await call(`${SESSION}.post`, { method: 'POST', staff: waiter, body: { openingCents: 1000 } })
    ctx.mem.public.none(
      `UPDATE cash_sessions SET opened_at = now() - interval '1 hour' WHERE staff_id = '${staffId}'`,
    )
    ctx.mem.public.none(
      `INSERT INTO payments (event_id, staff_id, total_cents, created_at)
       VALUES ('${seeded.eventId}', '${staffId}', 700, now() - interval '1 millisecond')`,
    )

    const closed = await call<{ expectedCents: number; closedAt: string }>(`${SESSION}/close.post`, {
      method: 'POST',
      staff: waiter,
      body: { countedCents: 1700 },
    })
    expect(closed.status).toBe(200)
    expect(closed.body.expectedCents).toBe(1700)

    const row = ctx.mem.public.one(
      `SELECT closed_at FROM cash_sessions WHERE staff_id = '${staffId}'`,
    ) as { closed_at: Date }
    const paid = ctx.mem.public.one(`SELECT created_at FROM payments`) as { created_at: Date }
    expect(row.closed_at.getTime()).toBeGreaterThanOrEqual(paid.created_at.getTime())
  })
})
