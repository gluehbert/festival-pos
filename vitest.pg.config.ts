import { defineConfig } from 'vitest/config'

// Runs route handlers against a real Postgres (TEST_DATABASE_URL), so real
// transactions, constraints and migrations are exercised. pg-mem cannot catch
// e.g. non-IMMUTABLE index predicates or driver-specific behaviour.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/pg/**/*.test.ts'],
    fileParallelism: false,
  },
})
