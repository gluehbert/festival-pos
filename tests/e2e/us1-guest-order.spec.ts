import { createHmac } from 'node:crypto'
import process from 'node:process'
import { test, expect } from '@playwright/test'
import { joinTable, menuItem, submitCart } from './helpers'

// US1 acceptance scenarios end-to-end. Skipped by default because reliably booting
// `pnpm dev` + Neon migrations in CI sandboxes is brittle. Enable by removing the
// skip and ensuring a DATABASE_URL pointing at a seeded test DB is set, plus a
// matching webServer entry in playwright.config.ts.

test.describe('@smoke US1 — guest scans table QR, orders, sees confirmation', () => {
  test('happy path', async ({ page }) => {
    await joinTable(page, 3)
    // Wait for menu items
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const addButtons = page.getByRole('button', { name: /add/i })
    await addButtons.nth(0).click()
    await addButtons.nth(1).click()

    await submitCart(page)
    await expect(page.getByRole('status')).toContainText(/order/i)

    await page.reload()
    await expect(page.getByText(/status/i)).toBeVisible()
  })

  test('an order whose first two answers are lost is placed exactly once', async ({ page }) => {
    await joinTable(page, 4)
    const itemQty = async () => ((await (await page.request.get('/api/orders/session')).json()) as { items: Array<{ quantity: number }> }).items.reduce((n, i) => n + i.quantity, 0)
    const before = await itemQty()
    let posts = 0
    // The server books the order, but the answer never arrives.
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      posts++
      if (posts <= 2) {
        await route.fetch()
        return route.abort('connectionreset')
      }
      return route.continue()
    })
    await page.getByRole('button', { name: /add/i }).first().click()
    await submitCart(page)
    await expect(page.getByRole('status').filter({ hasText: /order/i }).first()).toBeVisible({ timeout: 15_000 })
    expect(posts).toBe(3)
    expect(await itemQty()).toBe(before + 1)
  })

  test('wrong event PIN is rejected', async ({ page }) => {
    await page.goto('/?table=5')
    await page.getByLabel(/event pin/i).fill('WRONG1')
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('alert')).toContainText(/pin/i)
  })
})

test.describe('@smoke US1 — QR code link', () => {
  // The QR key is an HMAC of JWT_SECRET; only computable when the test runner
  // shares the server's secret (CI, local runs).
  test.skip(!process.env.JWT_SECRET, 'JWT_SECRET not available to the test runner')

  test('a QR link with a valid key opens the table directly', async ({ page, request }) => {
    const { eventId } = await (await request.get('/api/menu')).json() as { eventId: string }
    const key = createHmac('sha256', process.env.JWT_SECRET!).update(`table-key:${eventId}:6`).digest('base64url').slice(0, 16)
    await page.goto(`/t/6?k=${key}`)
    await expect(page).toHaveURL(/\/t\/6\?k=/)
    await expect(await menuItem(page, /^add fries to cart$/i)).toBeVisible()
  })

  test('a forged key falls back to the PIN prompt', async ({ page }) => {
    await page.goto('/t/7?k=forgedforgedforg')
    await expect(page).toHaveURL(/\/\?table=7$/)
  })
})
