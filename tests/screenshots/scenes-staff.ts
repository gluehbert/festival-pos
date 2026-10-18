import type { Ctx, Scene } from './scenes.ts'
import { collectPayment, guestOrders, kitchenFinishes, loginStaff, tapMenuItem } from './setup.ts'

// Open tickets at 3 and 9, table 5 with food that is ready, table 11 paid.
// Runs once per invocation, however many scenes need it.
let service: Promise<void> | undefined

async function guestOrderAt(ctx: Ctx, table: number, items: RegExp[]) {
  const { page, close } = await ctx.open('guest')
  await guestOrders(page, table, items)
  await close()
}

export function ensureService(ctx: Ctx): Promise<void> {
  service ??= (async () => {
    await guestOrderAt(ctx, 3, [/^add fries to cart$/i, /beer 0\.5 to cart/i])
    await guestOrderAt(ctx, 5, [/sausage to cart/i])
    await guestOrderAt(ctx, 9, [/burger to cart/i, /cola 0\.33 to cart/i])
    await guestOrderAt(ctx, 11, [/^add fries to cart$/i])

    const kitchen = await ctx.open('production')
    await loginStaff(kitchen.page, 'kitchen1', '1111', 'pin')
    await kitchenFinishes(kitchen.page, 5)
    await kitchen.close()

    const waiter = await ctx.open('staff')
    await loginStaff(waiter.page, 'waiter1', '1111', 'pin')
    await waiter.page.locator('[data-test="owner-all"]').click()
    await waiter.page.getByRole('link', { name: /table 11\b/i }).click()
    await waiter.page.getByRole('button', { name: /cash out/i }).click()
    await collectPayment(waiter.page)
    await waiter.page.locator('[data-test="pay-done"]').waitFor()
    await waiter.close()
  })()
  return service
}

async function waiterOnAll(ctx: Ctx) {
  await ensureService(ctx)
  const { page } = await ctx.open('staff')
  await loginStaff(page, 'waiter1', '1111', 'pin')
  await page.goto('/staff')
  await page.locator('[data-test="owner-all"]').click()
  return page
}

export const staffGrid: Scene = async (ctx) => {
  const page = await waiterOnAll(ctx)
  await page.getByRole('link', { name: /table 5\b/i }).waitFor()
  await ctx.shoot(page, 'staff-grid')
}

export const staffTable: Scene = async (ctx) => {
  const page = await waiterOnAll(ctx)
  await page.getByRole('link', { name: /table 5\b/i }).click()
  await page.locator('[data-test="ready-banner"]').waitFor()
  await ctx.shoot(page, 'staff-table')
}

export const staffPay: Scene = async (ctx) => {
  const page = await waiterOnAll(ctx)
  await page.getByRole('link', { name: /table 3\b/i }).click()
  await page.getByRole('button', { name: /cash out/i }).click()
  await page.locator('[data-test="pay-given"]').fill('20')
  await ctx.shoot(page, 'staff-pay')
}

export const staffOrder: Scene = async (ctx) => {
  const { page } = await ctx.open('staff')
  await loginStaff(page, 'waiter1', '1111', 'pin')
  await page.getByRole('link', { name: /new order/i }).click()
  await page.locator('[data-test="order-table"]').fill('7')
  await tapMenuItem(page, /^add beer 0\.5$/i, 2)
  await tapMenuItem(page, /^add sausage$/i, 1)
  await ctx.shoot(page, 'staff-order')
}

export const staffCash: Scene = async (ctx) => {
  const { page } = await ctx.open('staff')
  await loginStaff(page, 'waiter1', '1111', 'pin')
  await page.goto('/staff/cash')
  const opening = page.locator('[data-test="cash-opening"]')
  // A drawer left open by an earlier run stays as it is.
  if (await opening.isVisible({ timeout: 3000 }).catch(() => false)) {
    await opening.fill('50')
    await page.getByRole('button', { name: /open drawer/i }).click()
  }
  await page.locator('[data-test="cash-expected"]').waitFor()
  await ctx.shoot(page, 'staff-cash')
}
