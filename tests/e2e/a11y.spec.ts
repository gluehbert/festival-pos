import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { joinTable, loginStaff, openEventTab, openLiveEvent } from './helpers'

// NFR-003: no detectable WCAG 2 A/AA violations on the main screens.
async function expectNoViolations(page: Page) {
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(summary).toEqual([])
}

test.describe('@smoke a11y — axe-core', () => {
  test('guest start page and table page', async ({ page }) => {
    await page.goto('/')
    await expectNoViolations(page)
    await joinTable(page, 17)
    await expectNoViolations(page)
  })

  test('staff login, service overview, production and admin pages', async ({ page }) => {
    await page.goto('/staff/login')
    await expectNoViolations(page)
    await loginStaff(page, 'admin', 'admin123', 'password')
    for (const path of ['/admin/events', '/admin/staff', '/staff', '/production']) {
      await page.goto(path)
      await expectNoViolations(page)
    }
    await openLiveEvent(page)
    for (const tab of ['Overview', 'Design', 'Price list', 'QR codes', 'Reports']) {
      await openEventTab(page, tab)
      await expectNoViolations(page)
    }
  })
})
