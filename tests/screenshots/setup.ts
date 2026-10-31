import type { Locator, Page, Route } from '@playwright/test'

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

// Kitchen side: finishes every queued item of a table.
export async function kitchenFinishes(page: Page, tableNo: number): Promise<void> {
  const card = page.locator('[data-test="order-card"]').filter({ hasText: `Table ${tableNo}` })
  await card.getByRole('button', { name: `Table ${tableNo} all done` }).click()
  await card.waitFor({ state: 'detached' })
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

// Ends the event open in the admin workspace through the dialog, whatever the
// check list says (open items need the second tap).
export async function endEventInDialog(page: Page): Promise<void> {
  await page.locator('[data-test="event-end-open"]').click()
  const confirm = page.locator('[data-test="confirm-ok"]')
  await confirm.click()
  // Either the event ends right away or the warning asks for the second tap.
  const armed = page.getByText('Open amounts are recorded as not collected.')
  const ended = page.locator('[data-test="event-context"]').getByText('Ended', { exact: true })
  await armed.or(ended).first().waitFor()
  if (await armed.isVisible()) await confirm.click()
  await page.locator('[data-test="event-context"]').getByText('Ended', { exact: true }).waitFor()
}

// Makes an ended event live again; it must be open in the admin workspace.
export async function reactivateEvent(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Activate again' }).click()
  await page.getByRole('button', { name: 'Go live now' }).click()
  await page.locator('[data-test="event-context"]').getByText('Live', { exact: true }).waitFor()
}

// Creates an empty event with a unique name and makes it live (the running
// event must be ended before). Leaves the new event's workspace open.
export async function createLiveEvent(page: Page, name: string): Promise<void> {
  await page.goto('/admin/events')
  await page.getByRole('button', { name: 'New event' }).click()
  const form = page.locator('form')
  await form.getByLabel('Name', { exact: true }).fill(name)
  await form.getByLabel('PIN', { exact: true }).fill(`ZZ${Date.now().toString().slice(-6)}`)
  await form.getByLabel(/table from/i).fill('1')
  await form.getByLabel(/table to/i).fill('10')
  await form.getByRole('button', { name: /create/i }).click()
  await page.locator('[data-test="event-context"]').getByText('Draft', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Activate', exact: true }).click()
  await page.getByRole('button', { name: 'Go live now' }).click()
  await page.locator('[data-test="event-context"]').getByText('Live', { exact: true }).waitFor()
}

// Back to the seeded event after a scene ended it: opens it from the list.
export async function goLiveWithDemo(page: Page): Promise<void> {
  await page.goto('/admin/events')
  // Another event may still be live (a scene's throwaway event): end it first.
  const live = page.locator('[data-test="live-event"]')
  const anyLive = await live.waitFor({ timeout: 3000 }).then(() => true, () => false)
  if (anyLive) {
    await live.getByRole('link', { name: 'Edit' }).click()
    await page.locator('[data-test="event-context"]').waitFor()
    await endEventInDialog(page)
    await page.goto('/admin/events')
  }
  await page.locator('li').filter({ hasText: 'Demo Festival' }).getByRole('link', { name: 'Edit' }).click()
  await page.locator('[data-test="event-context"]').waitFor()
  await reactivateEvent(page)
}

// Network trouble for a scene: the first `failures` POSTs to the URL get a
// dropped connection (nothing reaches the server). Later ones are held
// unanswered when `then` is 'hang', or dropped too when it is 'fail'. Call the
// returned function before the scene ends: held requests are dropped, never
// sent, so nothing is booked.
export async function troubleRoute(page: Page, url: string, failures: number, then: 'hang' | 'fail'): Promise<() => Promise<void>> {
  let seen = 0
  const held: Route[] = []
  await page.route(url, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    seen++
    if (seen <= failures || then === 'fail') return route.abort('connectionreset')
    held.push(route)
  })
  return async () => {
    await Promise.all(held.splice(0).map((r) => r.abort('connectionreset').catch(() => {})))
  }
}
