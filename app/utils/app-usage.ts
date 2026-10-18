import type { AppUsageRow } from '~/../server/lib/contracts/reports'

// Event totals from the per-table usage rows. Shares and averages are null
// when there is nothing to divide by.
export interface UsageSummary {
  scans: number
  orderingDevices: number
  // Share of signed-in phones that ordered (0..1).
  orderingRate: number | null
  ordersPerDevice: number | null
  guestOrders: number
  staffOrders: number
  guestOrderShare: number | null
  guestItemShare: number | null
  // Waiter items per table: tables where guests also ordered by app vs. not.
  appTables: number
  staffItemsPerAppTable: number | null
  noAppTables: number
  staffItemsPerNoAppTable: number | null
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
const sum = (rows: AppUsageRow[], key: keyof AppUsageRow) => rows.reduce((n, r) => n + r[key], 0)

export function summarizeUsage(rows: AppUsageRow[]): UsageSummary {
  const scans = sum(rows, 'scans')
  const orderingDevices = sum(rows, 'orderingDevices')
  const guestOrders = sum(rows, 'guestOrders')
  const staffOrders = sum(rows, 'staffOrders')
  const guestItems = sum(rows, 'guestItems')
  const staffItems = sum(rows, 'staffItems')
  // Only tables that ordered at all; a table nobody sat at says nothing.
  const app = rows.filter((r) => r.guestOrders > 0)
  const noApp = rows.filter((r) => r.guestOrders === 0 && r.staffOrders > 0)
  return {
    scans,
    orderingDevices,
    orderingRate: ratio(orderingDevices, scans),
    ordersPerDevice: ratio(guestOrders, orderingDevices),
    guestOrders,
    staffOrders,
    guestOrderShare: ratio(guestOrders, guestOrders + staffOrders),
    guestItemShare: ratio(guestItems, guestItems + staffItems),
    appTables: app.length,
    staffItemsPerAppTable: ratio(sum(app, 'staffItems'), app.length),
    noAppTables: noApp.length,
    staffItemsPerNoAppTable: ratio(sum(noApp, 'staffItems'), noApp.length),
  }
}
