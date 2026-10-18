import { test, expect } from '@playwright/test'
import { guestOrders, loginStaff } from './helpers'

// US7: the kitchen sees one card per order and finishes it in one tap; the
// waiter then sees "food ready" on the table and confirms it was brought.
test.describe('@smoke US7 — kitchen finishes whole orders, waiter brings them', () => {
  test('order card -> all done -> food ready -> served', async ({ browser, page }) => {
    const guestContext = await browser.newContext()
    await guestOrders(await guestContext.newPage(), 16, [/^add fries to cart$/i, /sausage to cart/i, /beer 0\.5 to cart/i])
    await guestContext.close()

    const kitchen = await browser.newContext()
    const kitchenPage = await kitchen.newPage()
    await loginStaff(kitchenPage, 'kitchen1', '1111', 'pin')
    const card = kitchenPage.locator('[data-test="order-card"]').filter({ hasText: 'Table 16' })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('1 × Fries')
    await expect(card).toContainText('1 × Sausage')
    await expect(card).not.toContainText('Beer')
    await card.getByRole('button', { name: 'Table 16 all done' }).click()
    await expect(card).toHaveCount(0)
    await kitchen.close()

    await loginStaff(page, 'waiter1', '1111', 'pin')
    // Nobody looks after table 16 yet: under "All". The bar is not done, so
    // only the two kitchen items are to bring.
    await page.locator('[data-test="owner-all"]').click()
    const ticket = page.getByRole('link', { name: /table 16\b/i })
    await expect(ticket).toContainText('2 to serve')
    await ticket.click()
    await page.getByRole('button', { name: /served/i }).click()
    await expect(page.getByRole('button', { name: /served/i })).toHaveCount(0)
    await page.goto('/staff')
    await expect(page.getByRole('link', { name: /table 16\b/i })).not.toContainText('to serve')
  })
})
