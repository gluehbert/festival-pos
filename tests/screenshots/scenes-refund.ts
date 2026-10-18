import type { Ctx, Scene } from './scenes.ts'
import { collectPayment, guestOrders, loginStaff } from './setup.ts'

// Scenes for refunds by the shift lead: the dialog, the missing-drawer hint
// and the drawer line. Each scene orders and pays at its own table, so it
// also works alone.

async function paidTable(ctx: Ctx, table: number) {
  const guest = await ctx.open('guest')
  await guestOrders(guest.page, table, [/sausage to cart/i])
  await guest.close()
  const waiter = await ctx.open('staff')
  await loginStaff(waiter.page, 'waiter1', '1111', 'pin')
  await waiter.page.goto(`/staff/${table}/pay`)
  await collectPayment(waiter.page)
  await waiter.page.locator('[data-test="pay-done"]').waitFor()
  await waiter.close()
}

// Opens or closes lead1's drawer so that a scene starts from a known state.
async function leadDrawer(ctx: Ctx, want: 'open' | 'closed') {
  const { page } = await ctx.open('staff')
  await loginStaff(page, 'lead1', '1111', 'pin')
  await page.goto('/staff/cash')
  await page.waitForLoadState('networkidle')
  const opening = page.locator('[data-test="cash-opening"]')
  const isOpen = !(await opening.isVisible().catch(() => false))
  if (want === 'open' && !isOpen) {
    await opening.fill('50')
    await page.getByRole('button', { name: /open drawer/i }).click()
    await page.locator('[data-test="cash-expected"]').waitFor()
  }
  if (want === 'closed' && isOpen) {
    await page.locator('[data-test="cash-counted"]').fill('0')
    await page.getByRole('button', { name: /close drawer/i }).click()
    await page.locator('[data-test="confirm-ok"]').click()
    await opening.waitFor()
  }
  return page
}

async function openRefundDialog(page: Awaited<ReturnType<typeof leadDrawer>>, table: number) {
  await page.goto(`/staff/${table}`)
  await page.getByRole('button', { name: 'Refund' }).first().click()
  const dialog = page.getByRole('dialog', { name: /refund/i })
  await dialog.getByLabel(/reason/i).fill('Sausage was cold')
  return dialog
}

export const staffRefundLead: Scene = async (ctx) => {
  await paidTable(ctx, 16)
  const page = await leadDrawer(ctx, 'open')
  await openRefundDialog(page, 16)
  await ctx.shoot(page, 'staff-refund-lead')
}

export const staffRefundNeedsDrawer: Scene = async (ctx) => {
  await paidTable(ctx, 17)
  const page = await leadDrawer(ctx, 'closed')
  const dialog = await openRefundDialog(page, 17)
  await dialog.getByRole('button', { name: 'Refund' }).click()
  await dialog.getByRole('link', { name: /cash drawer/i }).waitFor()
  await ctx.shoot(page, 'staff-refund-needs-drawer')
}

export const staffCashRefundLine: Scene = async (ctx) => {
  await paidTable(ctx, 18)
  const page = await leadDrawer(ctx, 'open')
  const dialog = await openRefundDialog(page, 18)
  await dialog.getByRole('button', { name: 'Refund' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.goto('/staff/cash')
  await page.locator('[data-test="cash-expected"]').waitFor()
  await ctx.shoot(page, 'staff-cash-refund-line')
}
