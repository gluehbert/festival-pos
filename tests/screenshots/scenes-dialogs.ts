import type { Page } from '@playwright/test'
import type { Scene } from './scenes.ts'
import { loginStaff } from './setup.ts'

// Opens the cash drawer page of waiter1, opening the drawer first if needed.
async function cashPage(page: Page): Promise<void> {
  await loginStaff(page, 'waiter1', '1111', 'pin')
  await page.goto('/staff/cash')
  const opening = page.locator('[data-test="cash-opening"]')
  // Wait for the load to finish: either the open form or the Soll shows up.
  await page.locator('[data-test="cash-opening"], [data-test="cash-expected"]').first().waitFor()
  await page.waitForTimeout(500)
  // A drawer left open by an earlier run stays as it is.
  if (await opening.isVisible()) {
    await opening.fill('50')
    await page.getByRole('button', { name: /open drawer/i }).click()
  }
  await page.locator('[data-test="cash-expected"]').waitFor()
}

export const staffCashCloseDialog: Scene = async (ctx) => {
  const { page } = await ctx.open('staff')
  await cashPage(page)
  // 1 cent off the expected amount: the dialog shows a difference and a red button.
  await page.locator('[data-test="cash-counted"]').fill('49,99')
  await page.getByRole('button', { name: /^close drawer$/i }).click()
  await page.locator('[data-test="confirm-ok"]').waitFor()
  await ctx.shoot(page, 'staff-cash-close-dialog')
}

export const staffCashNote: Scene = async (ctx) => {
  const { page } = await ctx.open('staff')
  await cashPage(page)
  await page.locator('[data-test="cash-internal-note"]').waitFor()
  await ctx.shoot(page, 'staff-cash-note')
}

export const adminStaffResetInline: Scene = async (ctx) => {
  const { page } = await ctx.open('admin')
  await loginStaff(page, 'admin', 'admin123', 'password')
  await page.goto('/admin/staff')
  const row = page.getByRole('listitem').filter({ hasText: 'waiter1' })
  await row.getByRole('button', { name: /change pin/i }).click()
  await row.locator('[data-test="secret-input"]').fill('2468')
  await row.getByRole('button', { name: /show input/i }).click()
  await ctx.shoot(page, 'admin-staff-reset-inline')
}
