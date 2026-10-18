import { test, expect } from '@playwright/test'
import { collectPayment, ensureDrawerOpen, finishPayment, joinTable, loginStaff, openEventTab, openLiveEvent, tapMenuItem, submitCart } from './helpers'

// Paid by the waiter, then refunded by the admin or the shift lead from their
// own drawer: the item shows as cancelled; the admin sees the amount in the
// voids report.
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

    await ensureDrawerOpen(page)
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

  test('the shift lead refunds from their own drawer, and needs one open', async ({ browser, page }) => {
    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await joinTable(guestPage, 15)
    await tapMenuItem(guestPage, /sausage to cart/i)
    await submitCart(guestPage)
    await expect(guestPage.getByRole('status')).toContainText(/order/i)
    await guest.close()

    await loginStaff(page, 'lead1', '1111', 'pin')
    // Re-runs may find the drawer open; close it so that the hint shows first.
    await page.goto('/staff/cash')
    const closeButton = page.getByRole('button', { name: /close drawer/i })
    await closeButton.or(page.locator('[data-test="cash-opening"]')).first().waitFor()
    if (await closeButton.isVisible()) {
      await page.locator('[data-test="cash-counted"]').fill('0')
      await closeButton.click()
      await page.locator('[data-test="confirm-ok"]').click()
      await page.locator('[data-test="cash-opening"]').waitFor()
    }
    await page.goto('/staff/15/pay')
    await collectPayment(page)
    await finishPayment(page)

    await page.goto('/staff/15')
    await page.getByRole('button', { name: 'Refund' }).first().click()
    const dialog = page.getByRole('dialog', { name: /refund/i })
    await expect(dialog).toContainText(/taken from your drawer/i)
    await dialog.getByLabel(/reason/i).fill('Sausage was cold')
    await dialog.getByRole('button', { name: 'Refund' }).click()
    await expect(dialog.getByRole('link', { name: /cash drawer/i })).toBeVisible()

    await ensureDrawerOpen(page)
    await page.goto('/staff/15')
    const cancelledBefore = await page.getByText('voided', { exact: true }).count()
    await page.getByRole('button', { name: 'Refund' }).first().click()
    await dialog.getByLabel(/reason/i).fill('Sausage was cold')
    await dialog.getByRole('button', { name: 'Refund' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('voided', { exact: true })).toHaveCount(cancelledBefore + 1)

    await page.goto('/staff/cash')
    await expect(page.locator('[data-test="cash-expected"]')).toContainText('45.50')
  })
})
