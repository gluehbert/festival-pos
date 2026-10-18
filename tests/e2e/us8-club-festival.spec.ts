import { test, expect } from '@playwright/test'
import { collectPayment, joinTable, loginStaff, openEventTab, openLiveEvent, tapMenuItem } from './helpers'

// US8: festival extras — notes for the kitchen, cash drawer with closing,
// printable receipt, staff meals and the legal pages.
test.describe('@smoke US8 — club festival extras', () => {
  test('drawer -> order with note -> kitchen sees it -> cash -> receipt -> closing', async ({ browser, page }) => {
    await page.addInitScript(() => {
      window.print = () => { (window as unknown as { printed: number }).printed = ((window as unknown as { printed?: number }).printed ?? 0) + 1 }
    })
    await loginStaff(page, 'waiter1', '1111', 'pin')
    await page.goto('/staff/cash')
    // Re-runs against the same database may find the drawer still open.
    const closeButton = page.getByRole('button', { name: /close drawer/i })
    // isVisible() does not wait: first let the page decide between "close" and "open".
    await closeButton.or(page.locator('[data-test="cash-opening"]')).first().waitFor()
    if (await closeButton.isVisible()) {
      await page.locator('[data-test="cash-counted"]').fill('0')
      await closeButton.click()
      await page.locator('[data-test="confirm-ok"]').click()
    }
    await page.locator('[data-test="cash-opening"]').fill('50')
    await page.getByRole('button', { name: /open drawer/i }).click()
    await expect(page.locator('[data-test="cash-expected"]')).toContainText('50.00')

    await page.goto('/staff/order')
    await page.locator('[data-test="order-table"]').fill('9')
    await tapMenuItem(page, /^add sausage$/i, 1)
    await page.locator('[data-test="pad-lines"] summary').click()
    await page.getByRole('button', { name: /add a note to sausage/i }).click()
    await page.locator('[data-test="line-note-input"]').fill('no mustard')
    await page.locator('[data-test="line-note-input"]').press('Enter')
    await page.getByRole('button', { name: /send to kitchen\/bar/i }).click()
    await expect(page.getByRole('status')).toContainText('Table 9')

    const kitchen = await browser.newContext()
    const kitchenPage = await kitchen.newPage()
    await loginStaff(kitchenPage, 'kitchen1', '1111', 'pin')
    await expect(kitchenPage.locator('[data-test="order-card"]').filter({ hasText: 'Table 9' }).locator('[data-test="note-badge"]').first()).toContainText('no mustard')
    await kitchen.close()

    await page.goto('/staff/9/pay')
    await collectPayment(page)
    await expect(page.locator('[data-test="pay-done"]')).toBeVisible()
    await expect(page.locator('[data-test="last-receipt"]')).toBeVisible()
    await expect(page.locator('[data-test="receipt"]')).toContainText('Not a tax receipt')
    await page.locator('[data-test="print-receipt"]').click()
    expect(await page.evaluate(() => (window as unknown as { printed?: number }).printed)).toBe(1)

    await page.goto('/staff/cash')
    await expect(page.locator('[data-test="cash-expected"]')).not.toContainText('€50.00')
    await page.locator('[data-test="cash-counted"]').fill('50')
    await expect(page.locator('[data-test="cash-difference"]')).toContainText('short')
    await page.getByRole('button', { name: /close drawer/i }).click()
    await expect(page.getByRole('dialog')).toContainText('short')
    await page.locator('[data-test="confirm-ok"]').click()
    await expect(page.getByText(/drawer closed/i)).toBeVisible()
  })

  test('staff meal is booked at €0 with a reason', async ({ page }) => {
    await loginStaff(page, 'waiter1', '1111', 'pin')
    await page.locator('[data-test="staff-meal-link"]').click()
    await tapMenuItem(page, /^add sausage$/i, 2)
    const book = page.getByRole('button', { name: /book as staff meal/i })
    await expect(book).toBeDisabled()
    await page.locator('[data-test="meal-reason"]').fill('Grill stand shift')
    await book.click()
    await expect(page.getByRole('status')).toContainText(/staff meal booked/i)
  })

  test('admin maintains the legal notice, guests find it in the footer', async ({ page, browser }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await openEventTab(page, 'Design')
    await page.locator('[data-test="legal-imprint"]').fill('Demo Music Club\n1 Main Street')
    await page.getByRole('button', { name: /save legal texts/i }).click()
    await expect(page.getByText(/legal texts saved/i)).toBeVisible()

    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await joinTable(guestPage, 4)
    await guestPage.locator('[data-test="legal-footer"]').getByRole('link', { name: 'Legal notice' }).click()
    await expect(guestPage.locator('[data-test="legal-text"]')).toContainText('Demo Music Club')
    await guest.close()
  })
})
