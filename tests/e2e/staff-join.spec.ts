import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginStaff, openEventTab, openLiveEvent } from './helpers'

// Helpers join with one shared link: they type a name, the admin lets them
// in from the waiting room, and they land on the service screen.
test.describe('@smoke Join by link', () => {
  test('helper joins, admin lets them in, helper works as that person', async ({ browser, page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await openEventTab(page, 'Staff')
    const link = page.locator('[data-test="join-link"]')
    const create = link.locator('[data-test="join-create"]')
    const shown = link.locator('[data-test="join-url"]')
    await expect(create.or(shown)).toBeVisible()
    if (await create.isVisible()) await create.click()
    const url = (await shown.textContent())!.trim()
    expect(url).toMatch(/\/staff\/join\/[\w-]+$/)
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(a11y.violations.map((v) => v.id)).toEqual([])

    const helperContext = await browser.newContext()
    const helper = await helperContext.newPage()
    const name = `Helper ${Date.now() % 100000}`
    await helper.goto(url)
    await helper.getByLabel('Your name').fill(name)
    await helper.locator('[data-test="join-submit"]').click()
    await expect(helper.locator('[data-test="join-waiting"]')).toContainText(name)

    const request = page.locator('[data-test="join-request"]').filter({ hasText: name })
    await expect(request).toBeVisible({ timeout: 10_000 })
    await request.locator('[data-test="join-approve"]').click()
    await expect(page.locator('[data-test="join-member"]').filter({ hasText: name })).toBeVisible()

    await expect(helper).toHaveURL(/\/staff$/, { timeout: 10_000 })
    await helper.locator('[data-test="header-menu"]').click()
    await expect(helper.locator('[data-test="header-menu-panel"]')).toContainText(name)

    // Locked by the admin: the helper is out.
    await page.locator('[data-test="join-member"]').filter({ hasText: name }).locator('[data-test="join-member-toggle"]').click()
    await helper.goto('/staff/cash')
    await expect(helper).toHaveURL(/\/staff\/login/, { timeout: 10_000 })
    await helperContext.close()
  })
})
