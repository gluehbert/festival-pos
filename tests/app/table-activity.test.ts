import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import TableActivity from '~/components/staff/TableActivity.vue'
import TicketCard from '~/components/staff/TicketCard.vue'
import { tableActivity } from '~/utils/table-activity'
import { useTicketsStore } from '~/stores/tickets'
import { useCookie } from './setup/imports'
import type { TicketSummary } from '~/../server/lib/contracts/staff'

const NOW = Date.parse('2026-10-13T20:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

describe('tableActivity', () => {
  it('counts minutes since the last order', () => {
    expect(tableActivity(ago(23), null, NOW)).toEqual({ kind: 'order', minutes: 23 })
    expect(tableActivity(ago(0.5), null, NOW)).toEqual({ kind: 'order', minutes: 0 })
  })

  it('uses the check only when it is newer than the last order', () => {
    expect(tableActivity(ago(30), ago(5), NOW)).toEqual({ kind: 'check', minutes: 5 })
    expect(tableActivity(ago(5), ago(30), NOW)).toEqual({ kind: 'order', minutes: 5 })
  })

  it('never goes negative when the clocks disagree', () => {
    expect(tableActivity(ago(-3), null, NOW).minutes).toBe(0)
  })
})

describe('TableActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  const text = (props: Record<string, unknown>) => mount(TableActivity, { props: props as never }).text()

  it('shows the last order as plain text', () => {
    expect(text({ lastOrderAt: ago(23), lastCheckAt: null }))
      .toBe('staff.activity.order:{"age":"staff.ticket.minutesAgo:{\\"n\\":23}"}')
    expect(text({ lastOrderAt: ago(0), lastCheckAt: null })).toBe('staff.activity.order:{"age":"staff.ticket.justNow"}')
  })

  it('switches to hours after 60 minutes and shows a newer check', () => {
    expect(text({ lastOrderAt: ago(70), lastCheckAt: null })).toContain('staff.ticket.hoursAgo:{\\"h\\":1,\\"m\\":10}')
    expect(text({ lastOrderAt: ago(70), lastCheckAt: ago(4) }))
      .toBe('staff.activity.check:{"age":"staff.ticket.minutesAgo:{\\"n\\":4}"}')
  })

  it('applies the server clock offset and keeps counting', async () => {
    const w = mount(TableActivity, { props: { lastOrderAt: ago(10), lastCheckAt: null, clockOffsetMs: 5 * 60_000 } })
    expect(w.text()).toContain('{\\"n\\":15}')
    vi.advanceTimersByTime(60_000)
    await w.vm.$nextTick()
    expect(w.text()).toContain('{\\"n\\":16}')
    w.unmount()
  })
})

describe('TicketCard activity line', () => {
  const ticket = {
    ticketKey: 't-4', tableNo: 4, status: 'open', totalCents: 800, unpaidCents: 800, lockedBy: null, ready: { kitchen: 0, bar: 0 },
    oldestItemAt: ago(5), lastOrderAt: ago(5), lastCheckAt: null,
  } as TicketSummary
  const stubs = { NuxtLink: RouterLinkStub }

  it('shows it for tables, not for walk-ins', () => {
    expect(mount(TicketCard, { props: { ticket }, global: { stubs } }).find('[data-test="table-activity"]').exists()).toBe(true)
    expect(mount(TicketCard, { props: { ticket: { ...ticket, ticketKey: 'w-1' } }, global: { stubs } })
      .find('[data-test="table-activity"]').exists()).toBe(false)
  })
})

describe('tickets store', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('derives the clock offset from the server time', async () => {
    const s = useTicketsStore()
    fetchMock.mockResolvedValueOnce({ tickets: [], serverNow: new Date(Date.now() + 120_000).toISOString() })
    await s.refresh()
    expect(Math.round(s.clockOffsetMs / 1000)).toBe(120)
  })

  it('marks a table as asked', async () => {
    const s = useTicketsStore()
    fetchMock.mockResolvedValueOnce({ ticketKey: 't-4', checkedAt: new Date().toISOString() })
    expect(await s.markChecked('t-4')).toBe(true)
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/tickets/t-4/checked')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' })
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await s.markChecked('t-4')).toBe(false)
    expect(s.error).toBeTruthy()
  })
})
