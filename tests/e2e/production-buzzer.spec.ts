import { test, expect } from '@playwright/test'
import { guestOrders, loginStaff, openLiveEvent } from './helpers'

// A buzzer at the counter is a one-key keyboard: the admin stores its key,
// one press finishes the oldest card on the kitchen/bar screen.
test.describe('@smoke Buzzer at the kitchen/bar', () => {
  test('admin sets the key, one press finishes the oldest card, a double hit only one', async ({ browser, page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    const setting = page.locator('[data-test="buzzer-key"]')
    await setting.locator('[data-test="buzzer-set"]').click()
    await expect(setting.getByRole('status')).toContainText('Press the buzzer now')
    await page.keyboard.press('F9')
    await expect(setting.locator('[data-test="buzzer-current"]')).toHaveText('F9')

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guestOrders(guest, 19, [/sausage to cart/i])
    await guestOrders(guest, 20, [/sausage to cart/i])
    await guestContext.close()

    const kitchenContext = await browser.newContext()
    const kitchen = await kitchenContext.newPage()
    await loginStaff(kitchen, 'kitchen1', '1111', 'pin')
    await expect(kitchen).toHaveURL(/\/production$/)
    const cards = kitchen.locator('[data-test="order-card"]')
    await expect(cards.filter({ hasText: 'Table 20' })).toHaveCount(1)
    const before = await cards.count()
    const oldest = (await cards.first().locator('h2').innerText()).trim()

    // A hard slap sends the key twice: one card only.
    await kitchen.keyboard.press('F9')
    await kitchen.keyboard.press('F9')
    await expect(kitchen.getByRole('status')).toContainText(`${oldest} done`)
    await expect(cards).toHaveCount(before - 1)

    // Undo brings it back, as after "all done".
    await kitchen.locator('[data-test="undo-done"]').click()
    await expect(cards).toHaveCount(before)
    // Leave no open orders behind for the other smokes.
    for (const label of ['Table 19', 'Table 20']) await kitchen.getByRole('button', { name: `${label} all done` }).click()
    await expect(cards.filter({ hasText: /Table (19|20)/ })).toHaveCount(0)
    await kitchenContext.close()

    await setting.locator('[data-test="buzzer-clear"]').click()
    await expect(setting.locator('[data-test="buzzer-current"]')).toHaveCount(0)
  })
})
