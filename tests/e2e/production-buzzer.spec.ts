import { test, expect, type Page } from '@playwright/test'
import { guestOrders, loginStaff, openLiveEvent } from './helpers'

async function setBuzzer(page: Page, n: 1 | 2, key: string) {
  const row = page.locator(`[data-test="buzzer-kitchen-${n}"]`)
  await row.locator('[data-test="buzzer-set"]').click()
  await expect(row.getByRole('status')).toContainText('Press the buzzer now')
  await page.keyboard.press(key)
  await expect(row.locator('[data-test="buzzer-current"]')).toHaveText(key)
}

// Two kitchen buzzers at the counter, each a one-key keyboard with its own lane:
// a press finishes the lane's card, the lane takes the next one, the other
// lane keeps its card.
test.describe('@smoke Buzzers at the kitchen', () => {
  test('admin sets two buzzers, each finishes its own lane, the other lane stays put', async ({ browser, page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await setBuzzer(page, 1, 'F9')
    await setBuzzer(page, 2, 'F10')

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    for (const table of [19, 20, 13]) await guestOrders(guest, table, [/sausage to cart/i])
    await guestContext.close()

    const kitchenContext = await browser.newContext()
    const kitchen = await kitchenContext.newPage()
    await loginStaff(kitchen, 'kitchen1', '1111', 'pin')
    await expect(kitchen).toHaveURL(/\/production$/)
    const one = kitchen.locator('[data-test="lane-1"] [data-test="lane-label"]')
    const two = kitchen.locator('[data-test="lane-2"] [data-test="lane-label"]')
    const next = kitchen.locator('[data-test="lane-queue-card"]')
    await expect(next.filter({ hasText: 'Table 13' })).toHaveCount(1)
    const blue = (await two.innerText()).trim()

    // Work through lane 1 until our tables come up; a hard slap counts once.
    for (let i = 0; i < 20 && (await one.innerText()).trim() !== 'Table 19'; i++) {
      const before = (await one.innerText()).trim()
      await kitchen.keyboard.press('F9')
      await kitchen.keyboard.press('F9')
      await expect(kitchen.getByRole('status')).toContainText(`${before} done`)
      await expect(one).not.toHaveText(before)
      await expect(two).toHaveText(blue)
      await kitchen.waitForTimeout(1100)
    }
    await expect(one).toHaveText('Table 19')

    // Lane 1 done: it takes the oldest waiting card, lane 2 keeps its own.
    await kitchen.keyboard.press('F9')
    await expect(kitchen.getByRole('status')).toContainText('Table 19 done')
    await expect(one).not.toHaveText('Table 19')
    await expect(two).toHaveText(blue)

    // Undo brings Table 19 back; it waits for the next free lane.
    await kitchen.locator('[data-test="undo-done"]').click()
    await expect(next.filter({ hasText: 'Table 19' })).toHaveCount(1)

    // Leave no open orders behind for the other smokes.
    const empty = kitchen.getByText('No open items.')
    for (let i = 0; i < 30 && !(await empty.isVisible()); i++) {
      const button = kitchen.locator('[data-test^="lane-"] button:enabled').first()
      if (await button.count()) await button.click()
      else await kitchen.waitForTimeout(300)
    }
    await expect(empty).toBeVisible()
    await kitchenContext.close()

    for (const n of [1, 2]) await page.locator(`[data-test="buzzer-kitchen-${n}"] [data-test="buzzer-clear"]`).click()
    await expect(page.locator('[data-test="buzzer-current"]')).toHaveCount(0)
  })
})
