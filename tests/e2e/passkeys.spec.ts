import process from 'node:process'
import { test, expect } from '@playwright/test'
import { loginStaff } from './helpers'

// A passkey belongs to a domain, and an IP address is none: run on localhost.
const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000').replace('127.0.0.1', 'localhost')
test.use({ baseURL })

// Chrome's virtual authenticator plays the phone: it stores the passkey and
// "unlocks" it as if the fingerprint matched. Real signatures, real server checks.
test.describe('@smoke Passkey login', () => {
  // Only admins get the offer; waiters are once-a-year volunteers.
  test('set up after a password login, sign in without username, remove again', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    })

    await loginStaff(page, 'admin', 'admin123', 'password')
    await expect(page).toHaveURL(/\/admin\//)
    const offer = page.locator('[data-test="passkey-offer"]')
    await expect(offer).toBeVisible()
    await offer.locator('[data-test="passkey-offer-setup"]').click()
    await expect(offer.getByRole('status')).toContainText(/passkey set up/i)

    // Signed out, nothing typed: the device offers the passkey for this site.
    await context.clearCookies()
    await page.goto('/staff/login')
    await page.locator('[data-test="passkey-login"]').click()
    await expect(page).toHaveURL(/\/admin\//)
    await expect(page.locator('[data-test="passkey-offer"]')).toHaveCount(0)

    await page.locator('[data-test="header-menu"]').click()
    await page.locator('[data-test="menu-account"]').click()
    await page.locator('[data-test="account-passkeys"]').click()
    const row = page.locator('[data-test="passkey-row"]').first()
    await expect(row).toContainText(/admin/)
    await expect(row).toContainText(/last used/i)
    const removed = page.waitForResponse((r) => r.url().includes('/api/auth/passkeys/') && r.request().method() === 'DELETE')
    await row.getByRole('button').click()
    await page.locator('[data-test="confirm-ok"]').click()
    expect((await removed).ok()).toBe(true)

    // The device still holds the key, but the server no longer accepts it.
    await context.clearCookies()
    await page.goto('/staff/login')
    await page.locator('[data-test="passkey-login"]').click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/staff\/login/)
  })
})
