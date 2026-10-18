import { test, expect } from '@playwright/test'
import { loginStaff, openEventTab, openLiveEvent } from './helpers'

// US5: reports load with figures from the seeded/previous orders and every
// section can be exported as CSV.
test.describe('@smoke US5 — admin reports', () => {
  test('admin sees report sections and downloads a CSV', async ({ page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await openEventTab(page, 'Reports')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demo Festival')
    await expect(page.getByRole('heading', { name: 'Revenue by category' })).toBeVisible()
    await expect(page.locator('table').first()).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /csv/i }).first().click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
    const csv = await (await download.createReadStream()).toArray()
    expect(Buffer.concat(csv).toString('utf8')).toMatch(/^\uFEFF?category;totalCents;itemCount/)
  })
})
