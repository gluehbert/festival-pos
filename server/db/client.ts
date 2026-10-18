import { Pool as NeonPool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import process from 'node:process'
import pg from 'pg'
import { serverEnv } from '../lib/env'
import * as schema from './schema'

// Both drivers support interactive transactions (`db.transaction`), which the
// order/payment/void routes rely on. The neon-http driver does NOT.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

type GlobalWithDb = typeof globalThis & {
  __posDb?: { url: string; db: Db }
}

// DB_DRIVER=pg talks plain TCP Postgres (local dev, CI). Default is the Neon
// WebSocket pool, which is what runs on Vercel.
function createDb(url: string): Db {
  if (process.env.DB_DRIVER === 'pg') {
    return drizzlePg(new pg.Pool({ connectionString: url, max: 5 }), { schema }) as unknown as Db
  }
  return drizzleNeon(new NeonPool({ connectionString: url }), { schema }) as unknown as Db
}

export function getDb(): Db {
  const url = serverEnv().databaseUrl
  if (!url) {
    throw new Error('DATABASE_URL is not configured')
  }
  const g = globalThis as GlobalWithDb
  if (g.__posDb && g.__posDb.url === url) {
    return g.__posDb.db
  }
  const db = createDb(url)
  g.__posDb = { url, db }
  return db
}

export { schema }
