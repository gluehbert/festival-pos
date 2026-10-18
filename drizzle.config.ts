import { existsSync } from 'node:fs'
import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

for (const file of ['.env', '.env.local']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (see .env.example)')
}

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  dialect: 'postgresql',
  out: './server/db/migrations',
  // schema.ts is at the 300-line limit (FR-045); newer tables live next to it.
  schema: ['./server/db/schema.ts', './server/db/schema-service.ts', './server/db/schema-cash.ts', './server/db/schema-auth.ts', './server/db/schema-pricing.ts'],
  strict: true,
  verbose: true,
})
