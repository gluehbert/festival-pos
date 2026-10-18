import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { joinTable, loginStaff, menuItem, openEventTab, openLiveEvent } from './helpers'

// Aperol Spritz is seeded without allergen information: the admin records it,
// downloads the counter notice, and the guest switches allergens on and sees
// the code and the legend.
test.describe('@smoke Allergens', () => {
  test('admin records allergens, guests see codes and legend', async ({ browser, page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await openEventTab(page, 'Price list')

    const row = page.locator('[data-test="admin-menu-row"]').filter({ hasText: 'Aperol Spritz' })
    await row.locator('[data-test="allergen-edit"]').click()
    const editor = page.locator('[data-test="allergen-dialog"]')
    await editor.getByLabel('Allergens recorded').check()
    await editor.getByLabel(/Sulphur dioxide/).check()
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
    await expect(row.locator('[data-test="allergen-edit"]')).toContainText('O')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-test="allergen-pdf"]').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.pdf$/)

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await joinTable(guest, 17)
    await menuItem(guest, /Aperol Spritz to cart/i)
    const card = guest.locator('article').filter({ hasText: 'Aperol Spritz' })
    // Hidden until the guest switches allergens on.
    await expect(card.locator('[data-test="allergen-codes"]')).toHaveCount(0)
    await guest.locator('[data-test="allergen-toggle"]').click()
    await expect(card.locator('[data-test="allergen-codes"]')).toContainText('O')
    await expect(guest.locator('[data-test="allergen-legend"]')).toContainText('Molluscs')
    const a11y = await new AxeBuilder({ page: guest }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(a11y.violations).toEqual([])
    await guestContext.close()
  })
})
