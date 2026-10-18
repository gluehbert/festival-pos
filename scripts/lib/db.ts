import process from 'node:process'
import { neon } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../../server/db/schema.ts'

// CLI scripts only run plain statements, so neon-http is fine here.
// DB_DRIVER=pg targets a local/CI Postgres over TCP.
export function connect() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  if (process.env.DB_DRIVER === 'pg') {
    const pool = new pg.Pool({ connectionString: url })
    return { db: drizzlePg(pool, { schema }), close: () => pool.end() }
  }
  return { db: drizzleNeon(neon(url), { schema }), close: async () => {} }
}

export function isProductionTarget(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}
