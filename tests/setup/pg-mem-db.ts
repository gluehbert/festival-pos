import { DataType, newDb, type IMemoryDb } from 'pg-mem'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../server/db/schema'
import { readAllMigrationsSql } from './migrations'

const migrationSql = readAllMigrationsSql()

// Functions the migrations use that pg-mem lacks.
export function registerPgMemFunctions(mem: IMemoryDb): void {
  mem.public.registerFunction({
    name: 'gen_random_uuid',
    returns: { kind: 'simple', name: 'uuid' } as never,
    implementation: () => {
      const bytes = new Uint8Array(16)
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
      bytes[6] = (bytes[6]! & 0x0f) | 0x40
      bytes[8] = (bytes[8]! & 0x3f) | 0x80
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    },
    impure: true,
  })
  // Used by CHECK constraints (e.g. order_items_note_chk); missing in pg-mem.
  mem.public.registerFunction({
    name: 'char_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string | null) => (s === null ? null : [...s].length),
  })
  // timezone(zone, timestamptz) → local wall clock, returned as a Date whose
  // UTC fields hold it; to_char only knows the pattern the reports use.
  mem.public.registerFunction({
    name: 'timezone',
    args: [DataType.text, DataType.timestamptz],
    returns: DataType.timestamp,
    implementation: (zone: string, at: Date | null) => {
      if (at === null) return null
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(new Date(at)).map((p) => [p.type, p.value]))
      return new Date(Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!))
    },
  })
  mem.public.registerFunction({
    name: 'to_char',
    args: [DataType.timestamp, DataType.text],
    returns: DataType.text,
    implementation: (at: Date | null, pattern: string) => {
      if (at === null) return null
      if (pattern !== 'YYYY-MM-DD"T"HH24:00') throw new Error(`to_char pattern not supported in pg-mem: ${pattern}`)
      return `${new Date(at).toISOString().slice(0, 13)}:00`
    },
  })
}

export interface PgMemHandle {
  mem: IMemoryDb
  db: NodePgDatabase<typeof schema>
}

function extractSelectColumns(sqlText: string): string[] | null {
  let listText: string | null = null
  const selMatch = /^\s*select\s+([\s\S]+?)\s+from\s/i.exec(sqlText)
  if (selMatch) listText = selMatch[1]!
  if (!listText) {
    const retMatch = /\breturning\s+([\s\S]+?)\s*;?\s*$/i.exec(sqlText)
    if (retMatch) listText = retMatch[1]!
  }
  if (!listText) return null
  const cols: string[] = []
  let depth = 0
  let buf = ''
  for (let i = 0; i < listText.length; i++) {
    const ch = listText[i]!
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      cols.push(buf.trim())
      buf = ''
    }
    else {
      buf += ch
    }
  }
  if (buf.trim()) cols.push(buf.trim())
  return cols.map((c) => {
    const asMatch = /\s+as\s+"?([^"\s]+)"?\s*$/i.exec(c)
    if (asMatch) return asMatch[1]!
    const last = c.split('.').pop()!
    return last.replace(/^"(.*)"$/, '$1')
  })
}

function patchPool(pool: { query: (...args: unknown[]) => unknown; connect?: (...args: unknown[]) => unknown }): void {
  function wrap(orig: (...args: unknown[]) => unknown) {
    return async (config: unknown, ...rest: unknown[]) => {
      const wantArray = !!(config && typeof config === 'object' && (config as Record<string, unknown>).rowMode === 'array')
      const text = typeof (config as { text?: string })?.text === 'string'
        ? (config as { text: string }).text
        : typeof config === 'string'
          ? config
          : ''
      const clean = config && typeof config === 'object'
        ? (() => {
            const c = { ...(config as Record<string, unknown>) }
            delete c.types
            delete c.rowMode
            return c
          })()
        : config
      const result = await (orig(clean, ...rest) as Promise<{ rows: unknown[]; fields?: Array<{ name: string }> }>)
      if (wantArray && result && Array.isArray(result.rows)) {
        let names: string[] = result.fields && result.fields.length > 0
          ? result.fields.map((f) => f.name)
          : (extractSelectColumns(text) ?? [])
        if (result.rows.length > 0 && !Array.isArray(result.rows[0])) {
          // Prefer actual object keys from the first row since pg-mem reflects real column names there.
          const firstKeys = Object.keys(result.rows[0] as Record<string, unknown>)
          if (firstKeys.length > 0) names = firstKeys
        }
        if (names.length === 0) return result
        return {
          ...result,
          rows: result.rows.map((row) => {
            if (Array.isArray(row)) return row
            const obj = row as Record<string, unknown>
            return names.map((n) => obj[n])
          }),
        }
      }
      return result
    }
  }
  pool.query = wrap(pool.query.bind(pool)) as typeof pool.query
  if (typeof pool.connect === 'function') {
    const origConnect = pool.connect.bind(pool)
    pool.connect = async (...args: unknown[]) => {
      const client = await (origConnect as (...a: unknown[]) => Promise<{ query: (...x: unknown[]) => unknown; release?: () => void }>)(...args)
      client.query = wrap(client.query.bind(client)) as typeof client.query
      return client
    }
  }
}

export function buildPgMem(): PgMemHandle {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  registerPgMemFunctions(mem)
  const statements = migrationSql
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const stmt of statements) {
    mem.public.none(stmt)
  }
  const adapter = mem.adapters.createPg() as { Pool: new () => unknown }
  const pool = new adapter.Pool()
  patchPool(pool as never)
  const db = drizzle(pool as never, { schema })
  return { mem, db }
}

export interface SeedOptions {
  tableRangeFrom?: number
  tableRangeTo?: number
  items?: Array<{
    nameDe: string
    nameEn: string
    priceCents: number
    category: string
    station: 'kitchen' | 'bar' | 'cafe'
    isAvailable?: boolean
    sortOrder?: number
  }>
}

export interface SeededIds {
  eventId: string
  menuItemIds: string[]
  staffId: string
}

export function seedEvent(mem: IMemoryDb, opts: SeedOptions = {}): SeededIds {
  const from = opts.tableRangeFrom ?? 1
  const to = opts.tableRangeTo ?? 20
  const eventId = (mem.public.one(
    `INSERT INTO events (name, pin_code, table_range_from, table_range_to, is_active)
     VALUES ('Demo', 'DEMO1', ${from}, ${to}, true) RETURNING id`,
  ) as { id: string }).id
  const staffId = (mem.public.one(
    `INSERT INTO staff (username, password_hash, role) VALUES ('admin', 'h', 'admin') RETURNING id`,
  ) as { id: string }).id
  const items = opts.items ?? [
    { nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'food', station: 'kitchen' as const },
    { nameDe: 'Bier', nameEn: 'Beer', priceCents: 400, category: 'drink', station: 'bar' as const },
    { nameDe: 'Wasser', nameEn: 'Water', priceCents: 200, category: 'drink', station: 'bar' as const, isAvailable: false },
  ]
  const menuItemIds: string[] = []
  let sortIdx = 0
  for (const item of items) {
    const id = (mem.public.one(
      `INSERT INTO menu_items (event_id, name_de, name_en, price_cents, category, station, is_available, sort_order)
       VALUES ('${eventId}', '${item.nameDe.replace(/'/g, "''")}', '${item.nameEn.replace(/'/g, "''")}',
               ${item.priceCents}, '${item.category}', '${item.station}',
               ${item.isAvailable ?? true}, ${item.sortOrder ?? sortIdx}) RETURNING id`,
    ) as { id: string }).id
    menuItemIds.push(id)
    sortIdx++
  }
  return { eventId, menuItemIds, staffId }
}
