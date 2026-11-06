import { test, expect } from '@playwright/test'
import { guestOrders, loginStaff } from './helpers'

// US3: a guest order shows up in the kitchen queue (not at the bar), the
// kitchen finishes it and the guest sees it.
test.describe('@smoke US3 — kitchen production queue', () => {
  test('order -> kitchen finishes -> guest sees status', async ({ browser, page }) => {
    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guestOrders(guest, 15, [/sausage to cart/i])

    const bar = await browser.newContext()
    const barPage = await bar.newPage()
    await loginStaff(barPage, 'bar1', '1111')
    await expect(barPage).toHaveURL(/\/production$/)
    await expect(barPage.locator('[data-card]').filter({ hasText: 'Table 15' })).toHaveCount(0)
    await bar.close()

    await loginStaff(page, 'kitchen1', '1111')
    // The table's card, in the lane or waiting next to it: one tap finishes it.
    const card = page.locator('[data-card]').filter({ hasText: 'Table 15' })
    await expect(card).toContainText('Sausage')
    await card.getByRole('button', { name: /^table 15 (all )?done$/i }).click()
    await expect(card).toHaveCount(0)

    await guest.reload()
    // Finished reads "on its way": no pressure on the waiter from a "ready" label.
    await expect(guest.getByText(/on the way/i).first()).toBeVisible()
    await guestContext.close()
  })
})
