import { test, expect } from '@playwright/test'

// Admin creates a waiter account, the waiter can log in, and deactivating the
// account revokes the running session immediately. Needs `pnpm db:seed` data.
test.describe('@smoke Admin manages staff accounts', () => {
  test('create, log in, deactivate', async ({ browser, page }) => {
    const username = `e2e${Date.now().toString().slice(-6)}`

    await page.goto('/staff/login')
    await page.getByLabel(/username/i).fill('admin')
    await page.getByRole('textbox', { name: /password/i }).fill('admin123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)

    await page.getByRole('link', { name: /staff/i }).click()
    const form = page.locator('form')
    await form.getByLabel(/username/i).fill(username)
    await form.getByLabel('PIN').fill('2468')
    await form.getByRole('button', { name: /create/i }).click()
    await expect(page.getByRole('status')).toContainText(username)

    const waiter = await browser.newContext()
    const waiterPage = await waiter.newPage()
    await waiterPage.goto('/staff/login')
    await waiterPage.getByLabel(/username/i).fill(username)
    await waiterPage.getByRole('radio', { name: 'PIN' }).check()
    await waiterPage.getByRole('textbox', { name: 'PIN' }).fill('2468')
    await waiterPage.getByRole('button', { name: /sign in/i }).click()
    await expect(waiterPage).toHaveURL(/\/staff$/)

    const row = page.getByRole('listitem').filter({ hasText: username })

    // PIN reset happens inline in the row, not in a browser prompt.
    await row.getByRole('button', { name: /change pin/i }).click()
    await row.locator('[data-test="secret-input"]').fill('13579')
    await row.locator('[data-test="secret-save"]').click()
    await expect(page.getByRole('status')).toContainText(/credentials changed/i)
    await expect(row.locator('[data-test="secret-reset"]')).toHaveCount(0)

    // Wait for the server to store it: /activate/ alone would also match the
    // "Deactivate" button and pass before the request has landed.
    const saved = page.waitForResponse((r) => r.url().includes('/api/admin/staff/') && r.request().method() === 'PATCH')
    await row.getByRole('button', { name: /deactivate/i }).click()
    expect((await saved).ok()).toBe(true)
    await expect(row.getByRole('button', { name: /^activate$/i })).toBeVisible()

    const me = await waiterPage.request.get('/api/auth/me')
    expect(me.status()).toBe(401)
    await waiter.close()
  })
})
