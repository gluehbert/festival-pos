import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { PNG_1PX } from '../setup/fixtures'
import { joinTable, loginStaff, openEventTab, openLiveEvent } from './helpers'

// The admin gives the active event its own look; guests see the event's
// name, logo, colour, greeting, programme and flyer on the ordering pages.
test.describe('@smoke Event branding', () => {
  test('admin customises the event, guests see it', async ({ browser, page }) => {
    await loginStaff(page, 'admin', 'admin123', 'password')
    await openLiveEvent(page)
    await openEventTab(page, 'Design')
    const form = page.locator('[data-test="event-branding"]')

    await form.getByLabel('Event name').fill('Demo Festival 2026')
    await form.getByRole('textbox', { name: 'Accent colour' }).fill('#e30613')
    await form.getByLabel(/greeting/i).fill('Welcome to the Demo Festival of the fire brigade!')
    await form.getByLabel(/programme/i).fill('18:00 Keg tapping\n20:00 Live music')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Design saved')
    await expect(page.locator('[data-test="event-context"] h1')).toHaveText('Demo Festival 2026')

    await form.locator('[data-test="upload-logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX })
    await expect(form.getByRole('img', { name: 'Logo' })).toBeVisible()
    await form.locator('[data-test="upload-flyer"]').setInputFiles({ name: 'flyer.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') })
    await expect(form.getByRole('link', { name: /open flyer/i })).toBeVisible()
    const adminAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(adminAxe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any.map((a) => a.message).join()}`).join(' | ')}`)).toEqual([])

    const guestContext = await browser.newContext()
    const guest = await guestContext.newPage()
    await guest.goto('/?table=9')
    await expect(guest.getByRole('img', { name: /logo: demo festival/i })).toBeVisible()
    await expect(guest.getByText('Welcome to the Demo Festival of the fire brigade!')).toBeVisible()
    await expect(guest).toHaveTitle(/Demo Festival 2026/)
    const brand = await guest.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim())
    expect(brand).toBe('#e30613')
    const buttonBg = await guest.getByRole('button', { name: /continue/i }).evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(buttonBg).toBe('rgb(227, 6, 19)')

    const landingAxe = await new AxeBuilder({ page: guest }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(landingAxe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any.map((a) => a.message).join()}`).join(' | ')}`)).toEqual([])

    await joinTable(guest, 9)
    await expect(guest.locator('header').first()).toContainText('Demo Festival')
    const info = guest.locator('[data-test="event-info"]')
    await info.getByText(/programme/i).click()
    await expect(info).toContainText('18:00 Keg tapping')
    const flyerHref = await info.getByRole('link', { name: /open flyer/i }).getAttribute('href')
    const flyer = await guest.request.get(flyerHref!)
    expect(flyer.status()).toBe(200)
    expect(flyer.headers()['content-type']).toBe('application/pdf')
    await guestContext.close()

    // Reset so other specs keep the default look.
    await form.getByLabel('Event name').fill('Demo Festival')
    await form.getByRole('button', { name: 'Default' }).click()
    await form.getByLabel(/greeting/i).fill('')
    await form.getByLabel(/programme/i).fill('')
    await form.getByRole('button', { name: 'Save' }).click()
    await form.getByRole('button', { name: 'Remove' }).first().click()
    await expect(page.getByRole('status')).toContainText(/removed|saved/i)
  })
})
