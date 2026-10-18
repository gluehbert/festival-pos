import { test, expect } from '@playwright/test'
import { collectPayment, finishPayment, joinTable, tapMenuItem, submitCart } from './helpers'

// US2 smoke: a guest orders at table 4, a waiter logs in with the seeded PIN
// and cashes the whole ticket. Needs the server + `pnpm db:seed` data.
test.describe('@smoke US2 — staff cashes at table', () => {
  test('guest order is paid in full by a waiter', async ({ browser, page }) => {
    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await joinTable(guestPage, 4)
    await tapMenuItem(guestPage, /^add fries to cart$/i)
    await tapMenuItem(guestPage, /beer 0\.5 to cart/i)
    await submitCart(guestPage)
    await expect(guestPage.getByRole('status')).toContainText(/order/i)
    await guest.close()

    await page.goto('/staff/login')
    await page.getByLabel(/username/i).fill('waiter1')
    await page.getByRole('radio', { name: 'PIN' }).check()
    await page.getByRole('textbox', { name: 'PIN' }).fill('1111')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/staff$/)

    // A guest ordered at table 4, nobody looks after it yet: under "All".
    await page.locator('[data-test="owner-all"]').click()
    await page.getByRole('link', { name: /table 4\b/i }).click()
    await page.getByRole('button', { name: /cash out/i }).click()
    await collectPayment(page)

    // A fully paid ticket shows the result, then the table is empty again.
    await finishPayment(page)
    await expect(page.getByRole('link', { name: /table 4\b/i })).toContainText(/empty/i)
  })
})
