import { test, expect } from '@playwright/test'

// Once the service worker controls the page, online navigations must still
// come from the network; only a failed navigation shows the offline page.
test.describe('@smoke PWA service worker', () => {
  test('serves real pages online and the offline page when offline', async ({ page, context }) => {
    await page.goto('/staff/login')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await expect(page.evaluate(() => Boolean(navigator.serviceWorker.controller))).resolves.toBe(true)

    await page.goto('/staff/login')
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/offline|no connection/i)

    await context.setOffline(true)
    await page.goto('/staff/login').catch(() => {})
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/no connection/i)
    await context.setOffline(false)
  })
})
