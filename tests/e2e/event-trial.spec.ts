import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { guestOrders, loginStaff, openEventTab, openLiveEvent } from './helpers'

// Event date shown to guests, and a rehearsal whose orders are flagged as
// tests and deleted before the real event.
test.describe('@smoke Event date and rehearsal', () => {
  test('admin sets the date, runs a rehearsal and deletes its orders', async ({ browser, page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    const eventId = await openLiveEvent(page)
    const header = page.locator('[data-test="event-context"]')

    await openEventTab(page, 'Design')
    const form = page.locator('[data-test="event-branding"]')
    await form.getByLabel('Date (start, optional)').fill('2026-06-13')
    await form.getByLabel('Date (end, optional)').fill('2026-06-14')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Design saved')
    await expect(header).toContainText(/Sat 13\s–\sSun 14 June 2026/)

    const ordersPerHour = async () => ((await (await page.request.get(`/api/admin/events/${eventId}/reports?type=orders_per_hour`)).json()) as { rows: unknown[] }).rows
    const before = await ordersPerHour()

    await openEventTab(page, 'Overview')
    const trial = page.locator('[data-test="event-trial"]')
    await trial.getByRole('button', { name: 'Start rehearsal' }).click()
    await expect(page.locator('[data-test="trial-banner"]')).toContainText('REHEARSAL')
    await expect(trial).toContainText('Rehearsal running')
    await expect(header).toContainText('Rehearsal')

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guest.goto('/?table=11')
    await expect(guest.locator('[data-test="event-dates"]')).toContainText(/13\s–\sSun 14 June 2026/)
    await guestOrders(guest, 11, [/sausage to cart/i])
    await expect(guest.locator('[data-test="trial-banner"]')).toBeVisible()
    const axe = await new AxeBuilder({ page: guest }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await guestContext.close()

    await page.reload()
    await expect(trial).toContainText('1 test order')
    // The rehearsal order does not show up in reports.
    expect(await ordersPerHour()).toEqual(before)
    await trial.getByRole('button', { name: 'End rehearsal' }).click()
    await expect(trial.getByRole('alert')).toContainText('1 test order')
    await trial.getByRole('button', { name: 'Delete and end rehearsal' }).click()
    await expect(page.getByRole('status')).toContainText('Rehearsal ended')
    await expect(page.locator('[data-test="trial-banner"]')).toHaveCount(0)
    await expect(trial.getByRole('button', { name: 'Start rehearsal' })).toBeVisible()
    await expect(trial).not.toContainText('1 test order')

    // Reset so other specs see an undated event.
    await openEventTab(page, 'Design')
    await form.getByLabel('Date (start, optional)').fill('')
    await form.getByLabel('Date (end, optional)').fill('')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(header).toContainText('no date')
  })
})
