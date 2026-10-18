import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
// Optional: use a preinstalled Chromium instead of Playwright's download.
const executablePath = process.env.PW_CHROMIUM_PATH

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  grep: /@smoke/,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
})
