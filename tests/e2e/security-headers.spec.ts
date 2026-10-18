import { test, expect } from '@playwright/test'
import { joinTable, menuItem } from './helpers'

// The hash-based CSP must allow everything the app itself renders: any
// violation means a page is (partly) broken in production.
test.describe('@smoke Security headers', () => {
  test('pages load without CSP violations and cannot be framed', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (msg) => {
      if (/content security policy/i.test(msg.text())) violations.push(msg.text())
    })

    const res = await page.goto('/staff/login')
    const headers = res!.headers()
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).not.toContain("'unsafe-inline' 'self'")
    expect(headers['content-security-policy']).toMatch(/script-src 'self'( 'sha256-[^']+')*;/)

    await joinTable(page, 8)
    await expect(await menuItem(page, /^add fries to cart$/i)).toBeVisible()
    await page.locator('[data-test="header-menu"]').click()
    await page.getByRole('radio', { name: 'DE', exact: true }).click()
    // German literal on purpose: switching to the second locale must not break the CSP.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Speisekarte')

    expect(violations).toEqual([])
  })
})
