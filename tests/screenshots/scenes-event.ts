import type { Page } from '@playwright/test'
import type { Ctx, Scene } from './scenes.ts'
import { ensureService } from './scenes-staff.ts'
import {
  createLiveEvent, endEventInDialog, goLiveWithDemo, loginStaff, openLiveEvent,
} from './setup.ts'

// Scenes for ending and deleting events. They end the seeded event, so each
// one puts it back live before it finishes.

async function adminLoggedIn(ctx: Ctx): Promise<Page> {
  const { page } = await ctx.open('admin')
  await loginStaff(page, 'admin', 'admin123', 'password')
  return page
}

// waiter1 has a cash drawer open at the live event.
async function ensureDrawer(ctx: Ctx): Promise<void> {
  const { page, close } = await ctx.open('staff')
  await loginStaff(page, 'waiter1', '1111', 'pin')
  await page.goto('/staff/cash')
  const opening = page.locator('[data-test="cash-opening"]')
  // Let hydration and the drawer lookup finish: before that the form is
  // shown for a moment and typing into it would not stick.
  await page.waitForLoadState('networkidle')
  if (await opening.isVisible()) {
    await opening.fill('50')
    await page.getByRole('button', { name: /open drawer/i }).click()
  }
  await page.locator('[data-test="cash-expected"]').waitFor()
  await close()
}

// Ends the running event, runs `inside` on an empty event that is live for
// the moment, and restores the seeded event afterwards.
async function onEmptyEvent(ctx: Ctx, name: string, inside: (page: Page) => Promise<void>): Promise<void> {
  const page = await adminLoggedIn(ctx)
  await openLiveEvent(page)
  await endEventInDialog(page)
  try {
    await createLiveEvent(page, name)
    await inside(page)
  }
  finally {
    await goLiveWithDemo(page)
  }
}

export const adminEndCheck: Scene = async (ctx) => {
  await ensureService(ctx)
  await ensureDrawer(ctx)
  const page = await adminLoggedIn(ctx)
  await openLiveEvent(page)
  await page.locator('[data-test="event-end-open"]').click()
  await page.locator('[data-test="confirm-ok"]').waitFor()
  await ctx.shoot(page, 'admin-end-check')
}

export const adminEndClean: Scene = async (ctx) => {
  await onEmptyEvent(ctx, 'Autumn festival', async (page) => {
    // The "now live" toast would sit in the picture.
    await page.getByRole('status').waitFor({ state: 'detached' })
    await page.locator('[data-test="event-end-open"]').click()
    await page.getByText('Everything is settled.').waitFor()
    await ctx.shoot(page, 'admin-end-clean')
  })
}

// An ended event with the red section: reports exported, name typed, then
// the event is really deleted so the database stays tidy.
export const adminDelete: Scene = async (ctx) => {
  await onEmptyEvent(ctx, 'Old festival', async (page) => {
    await endEventInDialog(page)
    await page.locator('[data-test="event-export"]').click()
    await page.getByText('All reports downloaded.').waitFor()
    await page.locator('[data-test="event-delete-open"]').click()
    await page.locator('[data-test="event-delete-name"]').fill('Old festival')
    await page.getByRole('status').waitFor({ state: 'detached' })
    await ctx.shoot(page, 'admin-delete')
    await page.locator('[data-test="confirm-ok"]').click()
    await page.waitForURL('**/admin/events', { waitUntil: 'commit' })
  })
}

export const staffCashOtherEvent: Scene = async (ctx) => {
  await ensureDrawer(ctx)
  const admin = await adminLoggedIn(ctx)
  await openLiveEvent(admin)
  await endEventInDialog(admin)
  try {
    const { page } = await ctx.open('staff')
    await loginStaff(page, 'waiter1', '1111', 'pin')
    await page.goto('/staff/cash')
    await page.locator('[data-test="cash-other-event"]').waitFor()
    await page.locator('[data-test="cash-expected"]').waitFor()
    await ctx.shoot(page, 'staff-cash-other-event')
  }
  finally {
    await goLiveWithDemo(admin)
  }
}
