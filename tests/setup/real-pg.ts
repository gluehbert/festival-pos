import { resolve } from 'node:path'
import process from 'node:process'
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import * as schema from '../../server/db/schema'

export interface RealPg {
  db: NodePgDatabase<typeof schema>
  pool: pg.Pool
}

export function testDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL
}

// Drops everything and applies the committed migrations from scratch, exactly
// like a fresh Neon database on first deploy.
export async function freshDatabase(url: string): Promise<RealPg> {
  const pool = new pg.Pool({ connectionString: url, max: 5 })
  const db = drizzle(pool, { schema })
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  await db.execute(sql`CREATE SCHEMA public`)
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../server/db/migrations') })
  return { db, pool }
}
