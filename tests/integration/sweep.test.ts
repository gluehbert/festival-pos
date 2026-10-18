import { describe, expect, it } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { claimSweep, sweep, sweepIfDue } from '../../server/lib/sweep'
import type { Db } from '../../server/db/client'
import { guestSessions, paymentLocks } from '../../server/db/schema'
import { buildPgMem } from '../setup/pg-mem-db'

describe('sweep', () => {
  it('removes expired locks, expired sessions without orders and old login attempts', async () => {
    const { mem, db } = buildPgMem()
    const evId = (mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to) VALUES ('E','PIN1',1,10) RETURNING id`,
    ) as { id: string }).id
    const staffId = (mem.public.one(
      `INSERT INTO staff (username, password_hash, role) VALUES ('a','h','admin') RETURNING id`,
    ) as { id: string }).id
    const past = new Date(Date.now() - 60_000).toISOString()
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    const longAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    mem.public.none(
      `INSERT INTO payment_locks (event_id, table_no, staff_id, expires_at)
       VALUES ('${evId}', 1, '${staffId}', '${past}'),
              ('${evId}', 2, '${staffId}', '${future}')`,
    )
    mem.public.none(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at)
       VALUES ('${evId}', 1, '${past}'),
              ('${evId}', 2, '${future}')`,
    )
    mem.public.none(
      `INSERT INTO login_attempts (username, ip, created_at)
       VALUES ('old', '1.1.1.1', '${longAgo}'), ('new', '1.1.1.1', now())`,
    )

    const result = await sweep(db as unknown as Db)
    expect(result.expiredLocks).toBe(1)
    expect(result.expiredGuestSessions).toBe(1)

    expect(mem.public.many(`SELECT table_no FROM payment_locks ORDER BY table_no`)).toEqual([{ table_no: 2 }])
    expect(mem.public.many(`SELECT table_no FROM guest_sessions ORDER BY table_no`)).toEqual([{ table_no: 2 }])
    expect(mem.public.many(`SELECT username FROM login_attempts`)).toEqual([{ username: 'new' }])
  })

  it('keeps expired guest sessions that still own orders', async () => {
    const { mem, db } = buildPgMem()
    const evId = (mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to) VALUES ('E','PIN1',1,10) RETURNING id`,
    ) as { id: string }).id
    const past = new Date(Date.now() - 60_000).toISOString()
    const sessionId = (mem.public.one(
      `INSERT INTO guest_sessions (event_id, table_no, expires_at) VALUES ('${evId}', 3, '${past}') RETURNING id`,
    ) as { id: string }).id
    mem.public.none(`INSERT INTO orders (event_id, table_no, guest_session_id) VALUES ('${evId}', 3, '${sessionId}')`)

    const result = await sweep(db as unknown as Db)
    expect(result.expiredGuestSessions).toBe(0)
    expect(mem.public.many(`SELECT guest_session_id FROM orders`)).toEqual([{ guest_session_id: sessionId }])
  })

  it('removes flyers 90 days after the event ended, keeps logos and recent uploads', async () => {
    const { mem, db } = buildPgMem()
    const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60_000).toISOString()
    const insertEvent = (pin: string, active: boolean, deactivatedAt: string | null) => (mem.public.one(
      `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active, deactivated_at)
       VALUES ('E-${pin}', '${pin}', 1, 10, ${active}, ${deactivatedAt ? `'${deactivatedAt}'` : 'NULL'}) RETURNING id`,
    ) as { id: string }).id
    const insertAsset = (eventId: string, kind: string, createdAt: string) => mem.public.none(
      `INSERT INTO event_assets (event_id, kind, content_type, data_base64, byte_size, sha256, created_at)
       VALUES ('${eventId}', '${kind}', 'image/png', 'AA==', 1, 'x', '${createdAt}')`,
    )

    const old = insertEvent('OLD', false, daysAgo(91))
    const recent = insertEvent('RECENT', false, daysAgo(30))
    const reuploaded = insertEvent('REUP', false, daysAgo(200))
    const active = insertEvent('ACTIVE', true, null)
    insertAsset(old, 'flyer', daysAgo(120))
    insertAsset(old, 'logo', daysAgo(120))
    insertAsset(recent, 'flyer', daysAgo(60))
    insertAsset(reuploaded, 'flyer', daysAgo(10))
    insertAsset(active, 'flyer', daysAgo(400))

    const result = await sweep(db as unknown as Db)
    expect(result.expiredFlyers).toBe(1)

    const left = mem.public.many(`SELECT e.pin_code, a.kind FROM event_assets a JOIN events e ON e.id = a.event_id`) as { pin_code: string, kind: string }[]
    expect(left.map((r) => `${r.pin_code}:${r.kind}`).sort()).toEqual(['ACTIVE:flyer', 'OLD:logo', 'RECENT:flyer', 'REUP:flyer'])
  })

  it('uses the configured tables (paymentLocks, guestSessions)', () => {
    expect(getTableName(paymentLocks)).toBe('payment_locks')
    expect(getTableName(guestSessions)).toBe('guest_sessions')
  })
})

describe('sweep throttle', () => {
  it('lets exactly one caller claim the sweep per interval', async () => {
    const { db } = buildPgMem()
    const d = db as unknown as Db
    expect(await claimSweep(d)).toBe(true)
    expect(await claimSweep(d)).toBe(false)
    expect(await sweepIfDue(d)).toBeNull()
  })

  it('claims again once the last run is older than the interval', async () => {
    const { mem, db } = buildPgMem()
    const d = db as unknown as Db
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    mem.public.none(`INSERT INTO maintenance_runs (job, last_run_at) VALUES ('sweep', '${twoHoursAgo}')`)
    expect(await sweepIfDue(d)).toEqual({ expiredLocks: 0, expiredGuestSessions: 0, expiredFlyers: 0 })
    expect(await claimSweep(d)).toBe(false)
  })

  it('interval 0 (cron) always claims and records the run', async () => {
    const { mem, db } = buildPgMem()
    const d = db as unknown as Db
    expect(await claimSweep(d, 0)).toBe(true)
    expect(await claimSweep(d, 0)).toBe(true)
    expect(await claimSweep(d)).toBe(false)
    expect(mem.public.many(`SELECT job FROM maintenance_runs`)).toEqual([{ job: 'sweep' }])
  })
})
