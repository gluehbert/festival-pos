import type { Ctx, Scene } from './scenes.ts'
import { joinTable, openCart, tapMenuItem, troubleRoute } from './setup.ts'
import { waiterOnAll } from './scenes-staff.ts'

// Scenes for the automatic retry when sending. The requests never reach the
// server, so no order or payment is created.

// Table 3 pays: opens the pay page with the whole selection ready.
async function openPayPage(ctx: Ctx) {
  const page = await waiterOnAll(ctx)
  await page.getByRole('link', { name: /table 3\b/i }).click()
  await page.getByRole('button', { name: /cash out/i }).click()
  await page.locator('[data-test="pay-submit"]').waitFor()
  return page
}

async function tapTwice(page: Awaited<ReturnType<typeof openPayPage>>) {
  const button = page.locator('[data-test="pay-submit"]')
  await button.click()
  await page.locator('[data-test="pay-submit"]', { hasText: /tap to book/i }).waitFor()
  await button.click()
}

export const guestSending: Scene = async (ctx) => {
  const { page } = await ctx.open('guest')
  await joinTable(page, 3)
  await tapMenuItem(page, /add fries to cart/i)
  await tapMenuItem(page, /add beer 0\.5 to cart/i)
  const release = await troubleRoute(page, '**/api/orders', 2, 'hang')
  await openCart(page)
  await page.locator('[data-test="cart-submit"]').click()
  await page.locator('[data-test="sending-state"]').waitFor({ timeout: 10_000 })
  await page.getByText(/attempt 2 of 4/i).waitFor({ timeout: 10_000 })
  await ctx.shoot(page, 'guest-sending')
  await release()
}

export const staffPaySending: Scene = async (ctx) => {
  const page = await openPayPage(ctx)
  const release = await troubleRoute(page, '**/api/payments', 2, 'hang')
  await tapTwice(page)
  await page.getByText(/attempt 2 of 4/i).waitFor({ timeout: 10_000 })
  await ctx.shoot(page, 'staff-pay-sending')
  await release()
}

export const staffPayUnconfirmed: Scene = async (ctx) => {
  const page = await openPayPage(ctx)
  await troubleRoute(page, '**/api/payments', 0, 'fail')
  await tapTwice(page)
  // All four retries are used up after about 15 seconds.
  await page.getByRole('alert').filter({ hasText: /no answer/i }).waitFor({ timeout: 25_000 })
  await ctx.shoot(page, 'staff-pay-unconfirmed')
}
