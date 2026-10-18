import { expect, type Locator, type Page } from '@playwright/test'

// Seeded by `pnpm db:seed` (scripts/seed.ts).
export const DEMO_EVENT_PIN = 'DEMO1234'

// Opening /t/<n> without a QR key sends the guest to the start page, where
// the table number is prefilled and the event PIN unlocks the table.
export async function joinTable(page: Page, tableNo: number): Promise<void> {
  await page.goto(`/t/${tableNo}`)
  await expect(page).toHaveURL(new RegExp(`/\\?table=${tableNo}$`))
  await page.getByLabel(/event pin/i).fill(DEMO_EVENT_PIN)
  await page.getByRole('button', { name: /continue/i }).click()
  await expect(page).toHaveURL(new RegExp(`/t/${tableNo}$`))
}

export async function loginStaff(page: Page, username: string, secret: string, kind: 'password' | 'pin'): Promise<void> {
  await page.goto('/staff/login')
  await page.getByLabel(/username/i).fill(username)
  if (kind === 'pin') {
    await page.getByRole('radio', { name: 'PIN' }).check()
    await page.getByRole('textbox', { name: 'PIN' }).fill(secret)
  }
  else {
    // The mode is remembered per device: pick it explicitly.
    await page.getByRole('radio', { name: /password/i }).check()
    await page.getByRole('textbox', { name: /password/i }).fill(secret)
  }
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/\/staff\/login/)
}

// Cashing takes two taps on the same button: "Collect {amount}", then
// "Collect {amount}? Tap to book".
export async function collectPayment(page: Page): Promise<void> {
  const button = page.locator('[data-test="pay-submit"]')
  await button.click()
  await expect(button).toContainText(/tap to book/i)
  await button.click()
}

// A fully paid ticket shows what was taken, then goes back to the overview.
export async function finishPayment(page: Page, amount?: string): Promise<void> {
  const done = page.locator('[data-test="pay-done"]')
  await expect(done).toBeVisible()
  if (amount) await expect(done).toContainText(amount)
  await page.locator('[data-test="pay-done-overview"]').click()
  await expect(page).toHaveURL(/\/staff$/)
}

// The menu shows one category tab at a time: opens the tab that lists the
// item's button and returns it.
export async function menuItem(page: Page, name: RegExp): Promise<Locator> {
  const button = page.getByRole('button', { name })
  const tabs = page.getByRole('tab')
  await expect(tabs.first()).toBeVisible()
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

// The cart is a floating bar: open its sheet, then place the order.
export async function submitCart(page: Page): Promise<void> {
  await page.locator('[data-test="cart-toggle"]').click()
  await page.getByRole('button', { name: /place order/i }).click()
}

export async function guestOrders(page: Page, tableNo: number, itemNames: RegExp[]): Promise<void> {
  await joinTable(page, tableNo)
  for (const name of itemNames) await tapMenuItem(page, name)
  await submitCart(page)
  await expect(page.getByRole('status')).toContainText(/order/i)
}

// Opens the workspace of the live event from the admin overview and returns
// its id.
export async function openLiveEvent(page: Page): Promise<string> {
  await page.goto('/admin/events')
  await page.locator('[data-test="live-event"]').getByRole('link', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/)
  await expect(page.locator('[data-test="event-context"]')).toBeVisible()
  return page.url().split('/').pop()!
}

export async function openEventTab(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Sections of this event' }).getByRole('link', { name, exact: true }).click()
}
