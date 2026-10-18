import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { joinTable, loginStaff, menuItem, openEventTab, openLiveEvent } from './helpers'

// Admin downloads the price list template, uploads it back unchanged (no-op
// preview), then uploads a CSV with a new item and a price change.
test.describe('@smoke Admin imports the price list from Excel/CSV', () => {
  test('template download, preview, apply', async ({ browser, page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await openEventTab(page, 'Price list')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /template/i }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/)
    const xlsx = await readFile((await download.path())!)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({ name: 'menu.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx })
    const preview = page.locator('[data-test="menu-import-preview"]')
    await expect(preview).toContainText(/0 new, 0 changed/)
    await expect(preview.getByRole('button', { name: /apply/i })).toBeDisabled()
    await preview.getByRole('button', { name: /cancel/i }).click()

    const name = `Tarte ${Date.now().toString().slice(-5)}`
    const csv = `Name (DE);Name (EN);Price (€);Category;Station;Sort order;Available\n${name};${name};7.50;Food;Kitchen;60;yes\n`
    await fileInput.setInputFiles({ name: 'menu.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(preview).toContainText(/1 new/)
    await preview.getByRole('button', { name: /apply/i }).click()
    await expect(page.getByRole('status').filter({ hasText: /import applied/i })).toBeVisible()
    await expect(page.locator('[data-test="admin-menu-row"]').filter({ hasText: name })).toContainText('7.50')

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await joinTable(guest, 18)
    await expect(await menuItem(guest, new RegExp(`${name} to cart`, 'i'))).toBeVisible()
    await guestContext.close()
  })

  test('shows row errors and does not apply a broken file', async ({ page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await openEventTab(page, 'Price list')
    const csv = 'Name (DE);Price (€);Category;Station\nCola;expensive;Drinks;Bar\n'
    await page.locator('input[type="file"]').setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    const preview = page.locator('[data-test="menu-import-preview"]')
    await expect(preview.getByRole('alert')).toContainText('Row 2')
    await expect(preview.getByRole('button', { name: /apply/i })).toBeDisabled()
  })
})
