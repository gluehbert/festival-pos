import type { Ctx, Scene } from './scenes.ts'
import { ensureService, waiterOnAll } from './scenes-staff.ts'
import { adminOnEvent } from './scenes-admin.ts'
import { collectPayment, guestOrders, loginStaff } from './setup.ts'

// Scenes for the tip: one open table, one table paid with tip, the drawer
// that counts it and the report. Each scene prepares its own data, so it
// also works alone.

async function guestOrderAt(ctx: Ctx, table: number, items: RegExp[]) {
  const { page, close } = await ctx.open('guest')
  await guestOrders(page, table, items)
  await close()
}

// Opens waiter1's drawer unless one is open already. Cash taken before it
// does not count, so this comes before the payment.
async function ensureDrawer(ctx: Ctx) {
  const { page, close } = await ctx.open('staff')
  await loginStaff(page, 'waiter1', '1111', 'pin')
  await page.goto('/staff/cash')
  // The form flashes up before an open drawer is loaded.
  await page.waitForLoadState('networkidle')
  const opening = page.locator('[data-test="cash-opening"]')
  if (await opening.isVisible().catch(() => false)) {
    await opening.fill('50')
    await page.getByRole('button', { name: /open drawer/i }).click()
  }
  await page.locator('[data-test="cash-expected"]').waitFor()
  await close()
}

// Guest orders at the table, waiter1 cashes it with `given` and hands the
// change over as tip. Returns the page on the "all paid" result.
async function paidWithTip(ctx: Ctx, table: number, items: RegExp[], given: string) {
  await ensureService(ctx)
  await ensureDrawer(ctx)
  await guestOrderAt(ctx, table, items)
  const page = await waiterOnAll(ctx)
  await page.getByRole('link', { name: new RegExp(`tisch ${table}\\b`, 'i') }).click()
  await page.getByRole('button', { name: /cash out/i }).click()
  await page.locator('[data-test="pay-given"]').fill(given)
  await page.locator('[data-test="tip-change"]').click()
  await collectPayment(page)
  await page.locator('[data-test="pay-done-tip"]').waitFor()
  return page
}

export const staffPayTip: Scene = async (ctx) => {
  const page = await waiterOnAll(ctx)
  await page.getByRole('link', { name: /tisch 3\b/i }).click()
  await page.getByRole('button', { name: /cash out/i }).click()
  await page.locator('[data-test="pay-given"]').fill('20')
  await page.locator('[data-test="tip-change"]').click()
  await page.locator('[data-test="tip-line"]').waitFor()
  await ctx.shoot(page, 'staff-pay-tip')
}

export const staffPayDoneTip: Scene = async (ctx) => {
  const page = await paidWithTip(ctx, 13, [/pommes zum warenkorb/i, /bier 0,5 zum warenkorb/i], '10')
  await ctx.shoot(page, 'staff-pay-done-tip')
}

export const staffCashTip: Scene = async (ctx) => {
  await paidWithTip(ctx, 14, [/pommes zum warenkorb/i], '5')
  const { page } = await ctx.open('staff')
  await loginStaff(page, 'waiter1', '1111', 'pin')
  await page.goto('/staff/cash')
  await page.locator('[data-test="cash-tip"]').waitFor()
  await ctx.shoot(page, 'staff-cash-tip')
}

export const adminReportsTips: Scene = async (ctx) => {
  await (await paidWithTip(ctx, 15, [/pommes zum warenkorb/i], '5')).close()
  const page = await adminOnEvent(ctx, 'Berichte')
  await page.locator('[data-test="tips-total"]').waitFor()
  await ctx.shoot(page, 'admin-reports-tips')
}
