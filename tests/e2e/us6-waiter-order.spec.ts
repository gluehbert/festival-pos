import { test, expect, type Page } from '@playwright/test'
import { collectPayment, finishPayment, loginStaff, tapMenuItem } from './helpers'

async function tap(page: Page, name: RegExp, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name }).click()
}

// US6: a guest without smartphone orders at the waiter; the order reaches the
// kitchen, and two guests at the table pay their own share in cash.
test.describe('@smoke US6 — waiter takes the order and splits the bill', () => {
  test('table order -> kitchen -> two guests pay their share', async ({ browser, page }) => {
    await loginStaff(page, 'waiter1', '1111', 'pin')
    await page.getByRole('link', { name: /new order/i }).click()
    await page.locator('[data-test="order-table"]').fill('8')
    await tapMenuItem(page, /^add beer 0\.5$/i, 3)
    await tapMenuItem(page, /^add shandy 0\.5$/i, 8)
    await tapMenuItem(page, /^add sausage$/i, 2)
    await page.getByRole('button', { name: /send to kitchen\/bar/i }).click()
    await expect(page.getByRole('status')).toContainText('Table 8')

    const kitchen = await browser.newContext()
    const kitchenPage = await kitchen.newPage()
    await loginStaff(kitchenPage, 'kitchen1', '1111', 'pin')
    // .first(): re-runs against the same database leave earlier items queued.
    await expect(kitchenPage.locator('[data-test="order-card"]').filter({ hasText: 'Table 8' }).filter({ hasText: 'Sausage' }).first()).toBeVisible()
    await kitchen.close()

    await page.goto('/staff')
    await page.getByRole('link', { name: /table 8\b/i }).click()
    await page.getByRole('button', { name: /cash out/i }).click()

    // Everything starts selected; guest A pays only 2 beers, 1 shandy, 1 sausage.
    await page.getByRole('button', { name: /pay separately/i }).click()
    await tap(page, /^beer 0\.5: one more$/i, 2)
    await tap(page, /^shandy 0\.5: one more$/i, 1)
    await tap(page, /^sausage: one more$/i, 1)
    await expect(page.getByText('€18.00').first()).toBeVisible()
    await page.locator('[data-test="pay-given"]').fill('20')
    await expect(page.locator('[data-test="pay-change"]')).toContainText('2.00')
    await collectPayment(page)
    await expect(page.getByRole('status').filter({ hasText: '18.00' })).toContainText('change €2.00')

    // Guest B pays the rest: 1 beer, 7 shandies, 1 sausage.
    // The rest is selected again by itself.
    await expect(page.locator('[data-test="pay-group"]').filter({ hasText: 'Shandy' })).toContainText('open: 7')
    await expect(page.getByText('€40.50').first()).toBeVisible()
    await collectPayment(page)
    await finishPayment(page, '40.50')
    await expect(page.getByRole('link', { name: /table 8\b/i })).toContainText(/empty/i)
  })

  test('walk-in at the counter is sent and paid in one go', async ({ page }) => {
    await loginStaff(page, 'waiter1', '1111', 'pin')
    await page.getByRole('link', { name: /^counter$/i }).click()
    await tapMenuItem(page, /^add cola 0\.33$/i, 2)
    await page.getByRole('button', { name: /send & paid cash/i }).click()
    await expect(page.getByRole('status')).toContainText('6.00')
  })
})
