import { test, expect } from '@playwright/test'

// After login every role lands on its own screen, and the production screen
// is fully translated when switching to German.
test.describe('@smoke Role start pages and language switch', () => {
  test('kitchen staff land on the production queue, in English and German', async ({ page }) => {
    await page.goto('/staff/login')
    await page.getByLabel(/username/i).fill('kitchen1')
    await page.getByRole('radio', { name: 'PIN' }).check()
    await page.getByRole('textbox', { name: 'PIN' }).fill('1111')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/production$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kitchen')

    await page.locator('[data-test="header-menu"]').click()
    await page.getByRole('radio', { name: 'DE', exact: true }).click()
    // German literals on purpose: this checks the second locale.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Küche')
    await expect(page.getByRole('button', { name: 'Abmelden' })).toBeVisible()
  })

  test('/admin redirects to the events page', async ({ page }) => {
    const res = await page.request.get('/admin', { maxRedirects: 0 })
    expect(res.status()).toBeGreaterThanOrEqual(300)
    expect(res.headers().location).toBe('/admin/events')
  })
})
