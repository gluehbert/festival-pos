import { existsSync } from 'node:fs'
import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { migrationError } from './lib/migration-error.ts'

// Runs as part of `pnpm build`. On Vercel only production deployments migrate,
// so a preview build can never alter the production schema by accident.
// Set MIGRATE=1 to force (e.g. a preview with its own Neon branch database).
const onVercel = Boolean(process.env.VERCEL)
const shouldMigrate = process.env.MIGRATE === '1' || (onVercel && process.env.VERCEL_ENV === 'production')

if (!shouldMigrate) {
  console.log(`migrate: skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}; set MIGRATE=1 to force)`)
  process.exit(0)
}

for (const file of ['.env', '.env.local']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

if (!process.env.DATABASE_URL) {
  console.error('migrate: DATABASE_URL is not set, cannot run migrations')
  process.exit(1)
}

// Same driver, folder and journal table as `drizzle-kit migrate`, but a
// failure says why in the build log.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  await migrate(drizzle(pool), { migrationsFolder: './server/db/migrations' })
  console.log('migrate: up to date')
}
catch (err) {
  console.error(migrationError(err))
  process.exitCode = 1
}
finally {
  await pool.end()
}
