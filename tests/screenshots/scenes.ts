import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { chromium, devices, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { guestCart, guestMenu, guestStatus } from './scenes-guest.ts'
import { staffCash, staffGrid, staffOrder, staffPay, staffTable } from './scenes-staff.ts'
import { adminStaffResetInline, staffCashCloseDialog, staffCashNote } from './scenes-dialogs.ts'
import { adminDelete, adminEndCheck, adminEndClean, staffCashOtherEvent } from './scenes-event.ts'
import { adminReportsTips, staffCashTip, staffPayDoneTip, staffPayTip } from './scenes-pay.ts'
import { guestSending, staffPaySending, staffPayUnconfirmed } from './scenes-network.ts'
import { adminEvent, adminMenu, adminReports, productionOrders } from './scenes-admin.ts'

// Takes screenshots of the running app (see scripts/screenshots-env.sh).
// Usage: pnpm screenshots [--scene <name>]... [--out <dir>] [--base <url>] [--reset]

type Viewport = 'guest' | 'staff' | 'production' | 'admin'

export interface Ctx {
  open: (kind: Viewport) => Promise<{ page: Page, close: () => Promise<void> }>
  shoot: (page: Page, name: string) => Promise<void>
}
export type Scene = (ctx: Ctx) => Promise<void>

const SCENES: Record<string, Scene> = {
  'guest-menu': guestMenu,
  'guest-cart': guestCart,
  'guest-status': guestStatus,
  'staff-grid': staffGrid,
  'staff-table': staffTable,
  'staff-pay': staffPay,
  'staff-order': staffOrder,
  'staff-cash': staffCash,
  'staff-pay-tip': staffPayTip,
  'staff-pay-done-tip': staffPayDoneTip,
  'staff-cash-tip': staffCashTip,
  'admin-reports-tips': adminReportsTips,
  'production-orders': productionOrders,
  'admin-event': adminEvent,
  'admin-menu': adminMenu,
  'admin-reports': adminReports,
  'staff-cash-close-dialog': staffCashCloseDialog,
  'staff-cash-note': staffCashNote,
  'admin-staff-reset-inline': adminStaffResetInline,
  'admin-end-check': adminEndCheck,
  'admin-end-clean': adminEndClean,
  'admin-delete': adminDelete,
  'staff-cash-other-event': staffCashOtherEvent,
  'guest-sending': guestSending,
  'staff-pay-sending': staffPaySending,
  'staff-pay-unconfirmed': staffPayUnconfirmed,
}

const VIEWPORTS: Record<Viewport, { viewport: { width: number, height: number }, isMobile?: boolean, hasTouch?: boolean, userAgent?: string }> = {
  guest: devices['Pixel 5'],
  staff: devices['Pixel 5'],
  production: { viewport: { width: 1180, height: 820 } },
  admin: { viewport: { width: 1280, height: 900 } },
}

const { values } = parseArgs({
  options: {
    scene: { type: 'string', multiple: true },
    out: { type: 'string', default: 'tests/screenshots/out' },
    base: { type: 'string', default: 'http://127.0.0.1:3000' },
    reset: { type: 'boolean', default: false },
  },
})

// Drops and recreates the database, then lets the env script bring the app back.
function reset(): void {
  execFileSync('pkill', ['-f', '.output/server/index.mjs'], { stdio: 'ignore' })
  const psql = (sql: string) => execFileSync('su', ['postgres', '-c', `psql -c "${sql}"`], { stdio: 'ignore' })
  psql('DROP DATABASE IF EXISTS pos WITH (FORCE)')
  psql('CREATE DATABASE pos')
  execFileSync('bash', ['scripts/screenshots-env.sh'], { stdio: 'inherit' })
}

async function main(): Promise<void> {
  const names = values.scene?.length ? values.scene : Object.keys(SCENES)
  const unknown = names.filter((n) => !SCENES[n])
  if (unknown.length) throw new Error(`Unknown scene: ${unknown.join(', ')}. Known: ${Object.keys(SCENES).join(', ')}`)
  const out = resolve(values.out!)
  mkdirSync(out, { recursive: true })
  if (values.reset) reset()

  const browser: Browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  })
  const contexts: BrowserContext[] = []
  const files: string[] = []

  const ctx: Ctx = {
    async open(kind) {
      const context = await browser.newContext({
        ...VIEWPORTS[kind],
        baseURL: values.base,
        locale: 'en-US',
        colorScheme: 'light',
      })
      contexts.push(context)
      return { page: await context.newPage(), close: () => context.close() }
    },
    async shoot(page, name) {
      // Let fonts and the last poll settle before the shot.
      for (const [scheme, suffix] of [['light', ''], ['dark', '-dark']] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await page.waitForTimeout(500)
        const file = resolve(out, `${name}${suffix}.png`)
        // A full-page shot would stretch a modal's overlay over only the part of the
        // page the window shows; with a dialog open, take the window as the user sees it.
        const dialogOpen = await page.locator('[role="dialog"]').count() > 0
        await page.screenshot({ path: file, fullPage: !dialogOpen })
        files.push(file)
      }
    },
  }

  try {
    for (const name of names) {
      await SCENES[name]!(ctx)
      await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => {})))
    }
  }
  finally {
    await browser.close()
  }
  for (const file of files) console.log(file)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
