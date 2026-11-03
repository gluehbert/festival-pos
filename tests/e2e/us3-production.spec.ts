import { test, expect } from '@playwright/test'
import { guestOrders, loginStaff } from './helpers'

// US3: a guest order shows up in the kitchen queue (not at the bar), the
// kitchen moves it through "preparing" to "done" and the guest sees it.
test.describe('@smoke US3 — kitchen production queue', () => {
  test('order -> kitchen starts and finishes -> guest sees status', async ({ browser, page }) => {
    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guestOrders(guest, 15, [/sausage to cart/i])

    const bar = await browser.newContext()
    const barPage = await bar.newPage()
    await loginStaff(barPage, 'bar1', '1111', 'pin')
    await expect(barPage).toHaveURL(/\/production$/)
    await expect(barPage.locator('[data-test="order-card"]').filter({ hasText: 'Table 15' })).toHaveCount(0)
    await bar.close()

    await loginStaff(page, 'kitchen1', '1111', 'pin')
    // The table's card: its line moves through "preparing" to "done" on its own.
    const card = page.locator('[data-test="order-card"]').filter({ hasText: 'Table 15' })
    await expect(card).toContainText('Sausage')
    await card.getByRole('button', { name: 'Start preparing', exact: true }).click()
    await expect(card).toContainText('Preparing')
    await card.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(card).toHaveCount(0)

    await guest.reload()
    // Finished reads "on its way": no pressure on the waiter from a "ready" label.
    await expect(guest.getByText(/on the way/i).first()).toBeVisible()
    await guestContext.close()
  })
})
