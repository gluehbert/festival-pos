import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReportsPage from '~/pages/admin/events/[id]/reports.vue'
import { ReportTypeEnum } from '~/../server/lib/contracts/reports'
import type { EventDto } from '~/../server/lib/contracts/admin'
import { useCookie } from './setup/imports'

const ID = '00000000-0000-4000-8000-000000000001'
const ev = (isActive: boolean) => ({ id: ID, isActive }) as EventDto

const reports = Object.fromEntries(ReportTypeEnum.options.map((t) => [t, []])) as Record<string, unknown[]>
reports.revenue_by_category = [{ category: 'drink', totalCents: 1050, itemCount: 3 }]
reports.tips = [{ staffId: null, username: null, paymentCount: 2, tipCents: 150 }]

const fetchMock = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ eventId: ID, generatedAt: '2026-07-04T16:42:10.000Z', reports })
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const urls = () => fetchMock.mock.calls.map((c) => c[0] as string)

describe('admin reports page', () => {
  it('loads all tables with one request and shows the snapshot time', async () => {
    const w = mount(ReportsPage, { props: { event: ev(true) } })
    await flushPromises()
    expect(urls()).toEqual([`/api/admin/events/${ID}/reports/all`])
    expect(w.findAll('section')).toHaveLength(12)
    expect(w.text()).toContain('10.50')
    expect(w.get('[data-test="reports-as-of"]').text()).toContain('admin.reports.asOf')
    w.unmount()
  })

  it('polls every 15 s while live, every 60 s otherwise, and refreshes on demand', async () => {
    const live = mount(ReportsPage, { props: { event: ev(true) } })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await live.get('[data-test="reports-refresh"]').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    live.unmount()

    fetchMock.mockClear()
    const done = mount(ReportsPage, { props: { event: ev(false) } })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    done.unmount()
  })
})
