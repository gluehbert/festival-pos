import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppUsageReport from '~/components/admin/reports/AppUsageReport.vue'
import { summarizeUsage } from '~/utils/app-usage'
import type { AppUsageRow } from '~/../server/lib/contracts/reports'

const row = (tableNo: number, over: Partial<AppUsageRow> = {}): AppUsageRow => ({
  tableNo, scans: 0, orderingDevices: 0, guestOrders: 0, staffOrders: 0, guestItems: 0, staffItems: 0, ...over,
})

const rows = [
  row(1, { scans: 4, orderingDevices: 2, guestOrders: 5, staffOrders: 1, guestItems: 9, staffItems: 2 }),
  row(2, { scans: 2, orderingDevices: 1, guestOrders: 1, staffOrders: 3, guestItems: 1, staffItems: 6 }),
  row(3, { staffOrders: 4, staffItems: 10 }),
  // Signed in, never ordered: neither an app table nor a waiter-only table.
  row(4, { scans: 2 }),
]

describe('summarizeUsage', () => {
  it('builds funnel, app share and the app vs. no-app table comparison', () => {
    expect(summarizeUsage(rows)).toEqual({
      scans: 8,
      orderingDevices: 3,
      orderingRate: 3 / 8,
      ordersPerDevice: 2,
      guestOrders: 6,
      staffOrders: 8,
      guestOrderShare: 6 / 14,
      guestItemShare: 10 / 28,
      appTables: 2,
      staffItemsPerAppTable: 4,
      noAppTables: 1,
      staffItemsPerNoAppTable: 10,
    })
  })

  it('has no shares when nothing happened yet', () => {
    const s = summarizeUsage([])
    expect([s.orderingRate, s.ordersPerDevice, s.guestOrderShare, s.staffItemsPerAppTable, s.staffItemsPerNoAppTable])
      .toEqual([null, null, null, null, null])
  })
})

describe('AppUsageReport', () => {
  it('shows the totals and one line per table', () => {
    const text = mount(AppUsageReport, { props: { rows } }).text()
    expect(text).toMatch(/3 \(38\s?%\)/)
    expect(text).toMatch(/43\s?% \(6 \/ 14\)/)
    expect(text).toContain('admin.reports.usage.appTables:{"count":2}')
    expect(text).toContain('admin.reports.usage.compareHint')
  })

  it('shows a dash instead of a share without data', () => {
    const w = mount(AppUsageReport, { props: { rows: [] } })
    expect(w.text()).toContain('admin.reports.usage.none')
    expect(w.text()).toContain('admin.reports.empty')
  })
})
