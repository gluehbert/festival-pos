import { test, expect } from '@playwright/test'
import { joinTable, loginStaff, menuItem, openEventTab, openLiveEvent } from './helpers'

// US4: the admin adds a menu item, guests see it, the admin marks it as sold
// out and it disappears for guests. Also creates (but does not activate) an
// event, which opens as a draft, and downloads its QR code PDF.
test.describe('@smoke US4 — admin setup', () => {
  test('menu item lifecycle, event creation and QR PDF', async ({ browser, page }) => {
    const name = `Pretzel ${Date.now().toString().slice(-5)}`
    await loginStaff(page, 'admin', 'admin123', 'password')

    await openLiveEvent(page)
    await expect(page.locator('[data-test="event-context"]')).toContainText('Live')
    await openEventTab(page, 'Price list')
    const form = page.locator('form')
    await form.getByLabel(/name \(de\)/i).fill(name)
    await form.getByLabel(/name \(en\)/i).fill(name)
    await form.getByLabel(/price/i).fill('2.50')
    await form.getByLabel('Category', { exact: true }).fill('Snacks')
    await form.getByRole('button', { name: /create/i }).click()
    const row = page.locator('[data-test="admin-menu-row"]').filter({ hasText: name })
    await expect(row).toContainText('2.50')

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await joinTable(guest, 16)
    await expect(await menuItem(guest, new RegExp(`${name} to cart`, 'i'))).toBeVisible()

    await row.getByRole('switch', { name: new RegExp(name) }).click()
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await guest.reload()
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible()
    // Sold out: not in any tab, so the menu search finds nothing.
    await guest.getByRole('button', { name: /^search$/i }).click()
    await guest.getByRole('searchbox').fill(name)
    await expect(guest.getByRole('status').filter({ hasText: /nothing found/i })).toBeVisible()
    await expect(guest.getByText(name)).toHaveCount(0)
    await guestContext.close()

    await page.getByRole('link', { name: /all events/i }).click()
    await page.getByRole('button', { name: 'New event' }).click()
    const eventForm = page.locator('form')
    await eventForm.getByLabel('Name', { exact: true }).fill('Autumn Fair')
    await eventForm.getByLabel('PIN', { exact: true }).fill(`HF${Date.now().toString().slice(-4)}`)
    await eventForm.getByLabel(/table from/i).fill('1')
    await eventForm.getByLabel(/table to/i).fill('30')
    await eventForm.getByRole('button', { name: /create/i }).click()
    // The new event opens as a draft; the live event stays live.
    const header = page.locator('[data-test="event-context"]')
    await expect(header.locator('h1')).toHaveText('Autumn Fair')
    await expect(header).toContainText('Draft')
    await expect(header).toContainText('"Demo Festival" is live right now')

    await openEventTab(page, 'QR codes')
    // The overview has forms of its own; wait for the QR form.
    const qrForm = page.locator('form', { has: page.getByRole('button', { name: 'Download PDF' }) })
    // Defaults come from this event's tables.
    await expect(qrForm.getByLabel(/table to/i)).toHaveValue('30')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      qrForm.getByRole('button').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^qr-codes-\d+-\d+\.pdf$/)

    // Ending the live event shows the check list first. Afterwards it is
    // ended and may be reactivated, so the other specs keep a live event.
    await page.getByRole('link', { name: /all events/i }).click()
    await openLiveEvent(page)
    await page.locator('[data-test="event-end-open"]').click()
    const confirm = page.locator('[data-test="confirm-ok"]')
    await confirm.click()
    // Open items from earlier specs need the second tap.
    const armed = page.getByText('Open amounts are recorded as not collected.')
    await expect(armed.or(header.getByText('Ended', { exact: true })).first()).toBeVisible()
    if (await armed.isVisible()) await confirm.click()
    await expect(header).toContainText('Ended')
    await page.getByRole('button', { name: 'Activate again' }).click()
    await page.getByRole('button', { name: 'Go live now' }).click()
    await expect(header).toContainText('Live')
  })
})
