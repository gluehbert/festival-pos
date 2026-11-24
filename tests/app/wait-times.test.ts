import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WaitTimesTable from '~/components/admin/reports/WaitTimesTable.vue'

describe('wait times table', () => {
  it('shows minutes:seconds per station and the slowest hour, or a dash without one', () => {
    const w = mount(WaitTimesTable, {
      props: {
        rows: [
          { station: 'kitchen', itemCount: 12, medianSeconds: 245, p90Seconds: 1500, peakHour: '2026-07-04T19:00', peakHourMedianSeconds: 1100 },
          { station: 'bar', itemCount: 1, medianSeconds: 60, p90Seconds: 60, peakHour: null, peakHourMedianSeconds: null },
        ],
      },
    })
    const kitchen = w.get('[data-test="wait-row-kitchen"]').text()
    expect(kitchen).toContain('4:05')
    expect(kitchen).toContain('25:00')
    expect(kitchen).toContain('18:20')
    expect(w.get('[data-test="wait-row-bar"]').text()).toContain('–')
  })

  it('says so when nothing is finished yet', () => {
    const w = mount(WaitTimesTable, { props: { rows: [] } })
    expect(w.findAll('tbody tr')).toHaveLength(1)
  })
})
