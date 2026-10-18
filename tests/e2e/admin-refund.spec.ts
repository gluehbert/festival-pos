import { test, expect } from '@playwright/test'
import { collectPayment, finishPayment, joinTable, openEventTab, openLiveEvent, tapMenuItem, submitCart } from './helpers'

// Paid by the waiter, then refunded by the admin: the item shows as
// cancelled and the voids report lists the refunded amount.
test.describe('@smoke Admin refunds a paid item', () => {
  test('pay, refund, see it in the report', async ({ browser, page }) => {
    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await joinTable(guestPage, 14)
    await tapMenuItem(guestPage, /sausage to cart/i)
    await submitCart(guestPage)
    await expect(guestPage.getByRole('status')).toContainText(/order/i)
    await guest.close()

    await page.goto('/staff/login')
    await page.getByLabel(/username/i).fill('admin')
    await page.getByRole('textbox', { name: /password/i }).fill('admin123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/admin\/events$/)

    await page.goto('/staff/14/pay')
    await collectPayment(page)
    await finishPayment(page)

    await page.goto('/staff/14')
    // Re-runs against the same database leave earlier refunds on this table.
    await page.getByRole('button', { name: 'Refund' }).first().waitFor()
    const cancelledBefore = await page.getByText('voided', { exact: true }).count()
    await page.getByRole('button', { name: 'Refund' }).first().click()
    const dialog = page.getByRole('dialog', { name: /refund/i })
    await dialog.getByLabel(/reason/i).fill('Sausage was cold')
    await dialog.getByRole('button', { name: 'Refund' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('voided', { exact: true })).toHaveCount(cancelledBefore + 1)

    await openLiveEvent(page)
    await openEventTab(page, 'Reports')
    const row = page.getByRole('row').filter({ hasText: 'Sausage was cold' }).first()
    await expect(row).toContainText('4.50')
  })
})
