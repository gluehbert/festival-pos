import type { Locator, Page } from '@playwright/test'

// Helpers for preparing scene data through the UI. Copied from
// tests/e2e/helpers.ts without `expect`: a scene should fail with a plain
// timeout, not with an assertion.

export const DEMO_EVENT_PIN = 'DEMO1234'

export async function joinTable(page: Page, tableNo: number): Promise<void> {
  await page.goto(`/t/${tableNo}`)
  await page.waitForURL(new RegExp(`/\\?table=${tableNo}$`))
  await page.getByLabel(/event pin/i).fill(DEMO_EVENT_PIN)
  await page.getByRole('button', { name: /continue/i }).click()
  await page.waitForURL(new RegExp(`/t/${tableNo}$`))
}

export async function loginStaff(page: Page, username: string, secret: string, kind: 'password' | 'pin'): Promise<void> {
  await page.goto('/staff/login')
  await page.getByLabel(/username/i).fill(username)
  const mode = kind === 'pin' ? 'PIN' : /password/i
  await page.getByRole('radio', { name: mode }).check()
  await page.getByRole('textbox', { name: mode }).fill(secret)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.endsWith('/staff/login'))
  // First visit on a device shows the "How it works" card; scenes show the app itself.
  const intro = page.getByRole('button', { name: /let.s go/i })
  if (await intro.isVisible({ timeout: 1500 }).catch(() => false)) await intro.click()
}

// The menu shows one category tab at a time: opens the tab that lists the
// item's button and returns it.
export async function menuItem(page: Page, name: RegExp): Promise<Locator> {
  const button = page.getByRole('button', { name })
  const tabs = page.getByRole('tab')
  await tabs.first().waitFor()
  for (const tab of await tabs.all()) {
    await tab.click()
    if (await button.isVisible()) break
  }
  return button
}

export async function tapMenuItem(page: Page, name: RegExp, times = 1): Promise<void> {
  const button = await menuItem(page, name)
  for (let i = 0; i < times; i++) await button.click()
}

export async function openCart(page: Page): Promise<void> {
  await page.locator('[data-test="cart-toggle"]').click()
}

export async function submitCart(page: Page): Promise<void> {
  await openCart(page)
  await page.getByRole('button', { name: /place order/i }).click()
  await page.getByRole('status').filter({ hasText: /order/i }).first().waitFor()
}

export async function guestOrders(page: Page, tableNo: number, itemNames: RegExp[]): Promise<void> {
  await joinTable(page, tableNo)
  for (const name of itemNames) await tapMenuItem(page, name)
  await submitCart(page)
}

// Kitchen side: starts and finishes every queued item of a table.
export async function kitchenFinishes(page: Page, tableNo: number): Promise<void> {
  await page.getByRole('button', { name: 'Single items' }).click()
  const items = page.locator('[data-test="queue-item"]').filter({ hasText: `Table ${tableNo}` })
  while (await items.count() > 0) {
    const card = items.first()
    await card.getByRole('button', { name: 'Start preparing', exact: true }).click()
    await card.getByRole('button', { name: 'Done', exact: true }).click()
    await page.waitForTimeout(300)
  }
  await page.getByRole('button', { name: 'By order' }).click()
}

export async function openLiveEvent(page: Page): Promise<void> {
  await page.goto('/admin/events')
  await page.locator('[data-test="live-event"]').getByRole('link', { name: 'Edit' }).click()
  await page.locator('[data-test="event-context"]').waitFor()
}

export async function openEventTab(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Sections of this event' }).getByRole('link', { name, exact: true }).click()
}

export async function collectPayment(page: Page): Promise<void> {
  const button = page.locator('[data-test="pay-submit"]')
  await button.click()
  await page.locator('[data-test="pay-submit"]', { hasText: /tap to book/i }).waitFor()
  await button.click()
}
