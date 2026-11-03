import { sql } from 'drizzle-orm'
import journal from '../db/migrations/meta/_journal.json'
import type { Db } from '../db/client'

// Which migration this build was made for, and which one the database ran
// last. drizzle's migrator stores each migration's journal `when` as
// `created_at` in drizzle.__drizzle_migrations.
export interface SchemaVersion {
  expected: string
  actual: string | null
  match: boolean
}

interface JournalEntry { tag: string; when: number }

const entries: JournalEntry[] = journal.entries
const latest = entries[entries.length - 1]!

export function describeSchema(lastCreatedAt: number | null): SchemaVersion {
  if (lastCreatedAt === null) return { expected: latest.tag, actual: null, match: false }
  const known = entries.find((e) => e.when === lastCreatedAt)
  // Not in this build's journal: a newer deploy migrated the database.
  const actual = known?.tag ?? `newer than ${latest.tag}`
  return { expected: latest.tag, actual, match: lastCreatedAt === latest.when }
}

export async function readSchemaVersion(db: Db): Promise<SchemaVersion> {
  try {
    const res = await db.execute(sql`SELECT max(created_at) AS last FROM drizzle.__drizzle_migrations`) as unknown as { rows: Array<{ last: string | number | null }> }
    const last = res.rows[0]?.last
    return describeSchema(last === null || last === undefined ? null : Number(last))
  }
  catch {
    // No migrations table: the database was never migrated.
    return describeSchema(null)
  }
}
