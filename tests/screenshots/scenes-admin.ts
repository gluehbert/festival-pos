import type { Ctx, Scene } from './scenes.ts'
import { ensureService } from './scenes-staff.ts'
import { loginStaff, openEventTab, openLiveEvent } from './setup.ts'

export async function adminOnEvent(ctx: Ctx, tab?: string) {
  const { page } = await ctx.open('admin')
  await loginStaff(page, 'admin', 'admin123', 'password')
  await openLiveEvent(page)
  if (tab) await openEventTab(page, tab)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  return page
}

export const productionOrders: Scene = async (ctx) => {
  await ensureService(ctx)
  const { page } = await ctx.open('production')
  await loginStaff(page, 'kitchen1', '1111', 'pin')
  await page.locator('[data-test="order-card"]').first().waitFor()
  await ctx.shoot(page, 'production-orders')
}

export const adminEvent: Scene = async (ctx) => {
  await ctx.shoot(await adminOnEvent(ctx), 'admin-event')
}

export const adminMenu: Scene = async (ctx) => {
  await ctx.shoot(await adminOnEvent(ctx, 'Price list'), 'admin-menu')
}

export const adminReports: Scene = async (ctx) => {
  await ensureService(ctx)
  const page = await adminOnEvent(ctx, 'Reports')
  await page.getByRole('heading', { name: 'Revenue by category' }).waitFor()
  await ctx.shoot(page, 'admin-reports')
}
