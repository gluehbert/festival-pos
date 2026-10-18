import { spawnSync } from 'node:child_process'
import process from 'node:process'

// Runs as part of `pnpm build`. On Vercel only production deployments migrate,
// so a preview build can never alter the production schema by accident.
// Set MIGRATE=1 to force (e.g. a preview with its own Neon branch database).
const onVercel = Boolean(process.env.VERCEL)
const shouldMigrate = process.env.MIGRATE === '1' || (onVercel && process.env.VERCEL_ENV === 'production')

if (!shouldMigrate) {
  console.log(`migrate: skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}; set MIGRATE=1 to force)`)
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  console.error('migrate: DATABASE_URL is not set, cannot run migrations')
  process.exit(1)
}

const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
})
process.exit(result.status ?? 1)
