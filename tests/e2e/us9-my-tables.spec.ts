import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginStaff } from './helpers'

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

const TABLE = 19

// "Distribute tables": the shift lead (here the admin) hands a table to a
// waiter, who finds it under "My tables" without touching anything.
test.describe('@smoke US9 — handing out tables and my tables', () => {
  test('lead hands out a table, waiter sees it, lead frees it again', async ({ browser, page }) => {
    const other = await browser.newContext()
    const lead = await other.newPage()
    await loginStaff(lead, 'admin', 'admin123', 'password')
    await lead.goto('/staff/tables')
    await lead.locator('[data-test="distribute-person"]').filter({ hasText: 'waiter1' }).click()
    const leadTile = lead.locator('[data-test="distribute-table"]').filter({ hasText: new RegExp(`^${TABLE}`) })
    // An earlier (failed) run may have left the table with waiter1.
    if (await leadTile.getAttribute('aria-pressed') !== 'true') await leadTile.click()
    await expect(leadTile).toHaveAttribute('aria-pressed', 'true')
    await expect(leadTile).toContainText('waiter1')
    await expectNoViolations(lead)

    await loginStaff(page, 'waiter1', '1111', 'pin')
    await page.goto('/staff')
    // Waiters start in "My tables", with the grid only.
    await expect(page.locator('[data-test="owner-mine"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-test="view-list"]')).toHaveCount(0)
    const tile = page.getByRole('link', { name: new RegExp(`^table ${TABLE}\\b`, 'i') })
    await expect(tile).toHaveAttribute('data-mine', 'true')
    await page.locator('[data-test="owner-all"]').click()
    await expectNoViolations(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectNoViolations(page)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('[data-test="owner-mine"]').click()

    // On the table the waiter only sees who is in charge.
    await page.goto(`/staff/${TABLE}`)
    const box = page.locator('[data-test="table-assignment"]')
    await expect(box).toContainText(/my table/i)
    await expect(box.getByRole('button')).toHaveCount(0)

    // Freed by the lead: the waiter's grid drops the table with the next poll.
    await leadTile.click()
    await expect(leadTile).toContainText(/free/i)
    await page.goto('/staff')
    await expect(tile).toHaveCount(0, { timeout: 10_000 })
    await other.close()
  })
})
