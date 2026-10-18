import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installCommonMocks, makeCtx, setCtx, type RouteTestCtx } from '../setup/route-mocks'
import { makeEvent } from '../setup/h3-event'

beforeAll(async () => {
  await installCommonMocks()
})

const CSRF = 'a'.repeat(64)
let ctx: RouteTestCtx
let seeded: { eventId: string; menuItemIds: string[]; staffId: string }

function adminEvent(method: string) {
  const { event } = makeEvent({ method, cookies: { csrf: CSRF }, headers: { 'x-csrf-token': CSRF } })
  event.context.auth = { staff: { staffId: seeded.staffId, role: 'admin', username: 'a' } }
  event.context.params = { id: seeded.eventId }
  return event
}

const count = (table: string) =>
  (ctx.mem.public.one(`SELECT count(*)::int AS n FROM ${table}`) as { n: number }).n

describe('table state around rehearsals', () => {
  beforeEach(async () => {
    ctx = await makeCtx()
    setCtx(ctx)
    const { seedEvent } = await import('../setup/pg-mem-db')
    seeded = seedEvent(ctx.mem)
    ctx.mem.public.none(`UPDATE events SET trial_mode = true WHERE id = '${seeded.eventId}'`)
    ctx.mem.public.none(
      `INSERT INTO table_assignments (event_id, table_no, staff_id) VALUES ('${seeded.eventId}', 3, '${seeded.staffId}')`,
    )
    ctx.mem.public.none(
      `INSERT INTO table_checks (event_id, table_no, staff_id) VALUES ('${seeded.eventId}', 3, '${seeded.staffId}')`,
    )
  })

  it('"delete test data" leaves table assignments and checks alone', async () => {
    const reset = (await import('../../server/api/admin/events/[id]/trial-data.delete')).default
    await reset(adminEvent('DELETE'))
    expect(count('table_assignments')).toBe(1)
    expect(count('table_checks')).toBe(1)
  })

  it('"end rehearsal" clears table assignments and checks', async () => {
    const handler = (await import('../../server/api/admin/events/[id]/trial.put')).default
    ctx.setBody({ enabled: false })
    await handler(adminEvent('PUT'))
    expect(count('table_assignments')).toBe(0)
    expect(count('table_checks')).toBe(0)
  })

  it('switching off an event that is not in rehearsal leaves the tables alone', async () => {
    ctx.mem.public.none(`UPDATE events SET trial_mode = false WHERE id = '${seeded.eventId}'`)
    const handler = (await import('../../server/api/admin/events/[id]/trial.put')).default
    ctx.setBody({ enabled: false })
    await handler(adminEvent('PUT'))
    expect(count('table_assignments')).toBe(1)
    expect(count('table_checks')).toBe(1)
  })

  it('"start rehearsal" keeps table assignments and checks', async () => {
    ctx.mem.public.none(`UPDATE events SET trial_mode = false WHERE id = '${seeded.eventId}'`)
    const handler = (await import('../../server/api/admin/events/[id]/trial.put')).default
    ctx.setBody({ enabled: true })
    await handler(adminEvent('PUT'))
    expect(count('table_assignments')).toBe(1)
    expect(count('table_checks')).toBe(1)
  })
})
