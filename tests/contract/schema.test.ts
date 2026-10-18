import { describe, expect, it } from 'vitest'
import { newDb } from 'pg-mem'
import { readAllMigrationsSql } from '../setup/migrations'
import { registerPgMemFunctions } from '../setup/pg-mem-db'

const migrationSql = readAllMigrationsSql()

function makeDb() {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  registerPgMemFunctions(mem)

  const statements = migrationSql
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const stmt of statements) {
    mem.public.none(stmt)
  }
  return mem
}

describe('schema constraints', () => {
  it('inserting a second active event fails', () => {
    const mem = makeDb()
    mem.public.none(`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
      VALUES ('A', 'PIN1', 1, 10, true)
    `)
    expect(() => {
      mem.public.none(`
        INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
        VALUES ('B', 'PIN2', 1, 10, true)
      `)
    }).toThrow()
  })

  it('walk-in order with both guest_session_id and created_by_staff fails', () => {
    const mem = makeDb()
    const evId = (mem.public.one(`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to)
      VALUES ('A', 'PIN1', 1, 10) RETURNING id
    `) as { id: string }).id
    const staffId = (mem.public.one(`
      INSERT INTO staff (username, password_hash, role) VALUES ('u', 'h', 'waiter') RETURNING id
    `) as { id: string }).id
    const sessId = (mem.public.one(`
      INSERT INTO guest_sessions (event_id, table_no, expires_at)
      VALUES ('${evId}', 1, now() + interval '7 days') RETURNING id
    `) as { id: string }).id
    expect(() => {
      mem.public.none(`
        INSERT INTO orders (event_id, table_no, guest_session_id, created_by_staff)
        VALUES ('${evId}', 1, '${sessId}', '${staffId}')
      `)
    }).toThrow()
  })

  it('order kind must match its origin', () => {
    const mem = makeDb()
    const evId = (mem.public.one(`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to)
      VALUES ('A', 'PIN1', 1, 10) RETURNING id
    `) as { id: string }).id
    const staffId = (mem.public.one(`
      INSERT INTO staff (username, password_hash, role) VALUES ('u', 'h', 'waiter') RETURNING id
    `) as { id: string }).id
    // Staff orders default to 'guest' only by mistake: rejected.
    expect(() => {
      mem.public.none(`INSERT INTO orders (event_id, table_no, created_by_staff) VALUES ('${evId}', 1, '${staffId}')`)
    }).toThrow()
    expect(() => {
      mem.public.none(`INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${evId}', 1, 'other', '${staffId}')`)
    }).toThrow()
    mem.public.none(`INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${evId}', 1, 'staff_table', '${staffId}')`)
    mem.public.none(`INSERT INTO orders (event_id, table_no, kind, created_by_staff) VALUES ('${evId}', 0, 'walkin', '${staffId}')`)
  })

  it('duplicate idempotency_key for same (event_id, guest_session_id) fails', () => {
    const mem = makeDb()
    const evId = (mem.public.one(`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to)
      VALUES ('A', 'PIN1', 1, 10) RETURNING id
    `) as { id: string }).id
    const sessId = (mem.public.one(`
      INSERT INTO guest_sessions (event_id, table_no, expires_at)
      VALUES ('${evId}', 1, now() + interval '7 days') RETURNING id
    `) as { id: string }).id
    mem.public.none(`
      INSERT INTO orders (event_id, table_no, guest_session_id, idempotency_key)
      VALUES ('${evId}', 1, '${sessId}', 'key-1')
    `)
    expect(() => {
      mem.public.none(`
        INSERT INTO orders (event_id, table_no, guest_session_id, idempotency_key)
        VALUES ('${evId}', 1, '${sessId}', 'key-1')
      `)
    }).toThrow()
  })

  it('payments.tip_cents defaults to 0 and must not be negative', () => {
    const mem = makeDb()
    const evId = (mem.public.one(`
      INSERT INTO events (name, pin_code, table_range_from, table_range_to)
      VALUES ('A', 'PIN1', 1, 10) RETURNING id
    `) as { id: string }).id
    const staffId = (mem.public.one(`
      INSERT INTO staff (username, password_hash, role) VALUES ('u', 'h', 'waiter') RETURNING id
    `) as { id: string }).id
    const row = mem.public.one(`
      INSERT INTO payments (event_id, staff_id, total_cents) VALUES ('${evId}', '${staffId}', 100) RETURNING tip_cents
    `) as { tip_cents: number }
    expect(row.tip_cents).toBe(0)
    expect(() => {
      mem.public.none(`INSERT INTO payments (event_id, staff_id, total_cents, tip_cents) VALUES ('${evId}', '${staffId}', 100, -1)`)
    }).toThrow()
    mem.public.none(`INSERT INTO payments (event_id, staff_id, total_cents, tip_cents) VALUES ('${evId}', '${staffId}', 100, 50)`)
  })

  it('audit_log accepts event_end and event_delete but no unknown action', () => {
    const mem = makeDb()
    const insert = (action: string) =>
      mem.public.none(`INSERT INTO audit_log (action, target_kind, target_id) VALUES ('${action}', 'event', '00000000-0000-4000-8000-000000000000')`)
    insert('event_end')
    insert('event_delete')
    expect(() => insert('event_explode')).toThrow()
  })
})
