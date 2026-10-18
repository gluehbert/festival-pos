import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const appDir = fileURLToPath(new URL('./app', import.meta.url))

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      // Server code plus the client logic that has unit tests (stores,
      // composables, components); pages are covered by the Playwright smokes.
      include: ['server/**/*.ts', 'app/stores/**/*.ts', 'app/composables/**/*.ts', 'app/components/**/*.vue'],
      exclude: ['server/db/migrations/**'],
      // Floors at today's level per area; raise as coverage grows.
      thresholds: {
        'server/**': { statements: 80, branches: 60, functions: 75, lines: 80 },
        'app/**': { statements: 75, branches: 70, functions: 70, lines: 75 },
      },
    },
    globals: true,
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          globals: true,
          include: [
            'tests/contract/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/unit/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [vue()],
        define: { 'import.meta.client': true, 'import.meta.server': false },
        resolve: {
          alias: {
            '~': appDir,
            '#imports': fileURLToPath(new URL('./tests/app/setup/imports.ts', import.meta.url)),
          },
        },
        test: {
          name: 'app',
          environment: 'happy-dom',
          globals: true,
          include: ['tests/app/**/*.test.ts'],
          setupFiles: ['tests/app/setup/global.ts'],
        },
      },
    ],
  },
})
