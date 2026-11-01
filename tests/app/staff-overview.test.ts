import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { useAuthStore, type StaffRole } from '~/stores/auth'
import OverviewPage from '~/pages/staff/index.vue'
import { useWelcome } from '~/composables/useWelcome'
import { useCookie } from './setup/imports'

const ANNA = { staffId: '00000000-0000-4000-8000-00000000000a', username: 'anna' }
const fetchMock = vi.fn()
const stubs = { NuxtLink: RouterLinkStub }

// Table 3 has an open order but nobody in charge; table 2 is anna's.
const unattended = {
  ticketKey: 't-3', tableNo: 3, status: 'open', totalCents: 800, unpaidCents: 800, lockedBy: null,
  ready: { kitchen: 0, bar: 0 }, foodToPay: 0, oldestItemAt: '2026-10-16T18:00:00.000Z', lastOrderAt: '2026-10-16T18:00:00.000Z', lastCheckAt: null, assignee: null,
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
  localStorage.clear()
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/tickets')) {
      return { tickets: [unattended], assignments: [{ tableNo: 2, ...ANNA, assignedAt: '2026-10-16T18:00:00.000Z' }], tableRange: { from: 1, to: 4 }, serverNow: new Date().toISOString() }
    }
    return {}
  })
})
afterEach(() => vi.unstubAllGlobals())

async function open(role: StaffRole) {
  useAuthStore().staff = { ...ANNA, role, theme: 'system' }
  const w = mount(OverviewPage, { global: { stubs } })
  await flushPromises()
  return w
}

describe('service overview', () => {
  it('gives a waiter only their tables as a grid, with "My tables/All" as the one switch', async () => {
    const w = await open('waiter')
    expect(w.get('[data-test="owner-mine"]').attributes('aria-pressed')).toBe('true')
    expect(w.find('[data-test="view-list"]').exists()).toBe(false)
    expect(w.find('[data-test="paid-toggle"]').exists()).toBe(false)
    expect(w.findAll('[data-test="table-tile"]').map((t) => t.text().match(/\d+/)![0])).toEqual(['2'])
    // Handing out and unattended tables are the shift lead's job.
    expect(w.find('[data-test="needs-someone"]').exists()).toBe(false)
    expect(w.find('[data-test="distribute-link"]').exists()).toBe(false)
  })

  it('keeps list, paid tables, unattended tables and handing out for the shift lead', async () => {
    const w = await open('lead')
    expect(w.find('[data-test="distribute-link"]').exists()).toBe(true)
    expect(w.find('[data-test="view-list"]').exists()).toBe(true)
    expect(w.find('[data-test="paid-toggle"]').exists()).toBe(true)
    await w.get('[data-test="owner-mine"]').trigger('click')
    expect(w.find('[data-test="needs-someone"]').text()).toContain('3')
  })
})

describe('trays at the counter', () => {
  it('shows a waiter finished trays of other tables under "My tables" only', async () => {
    const ready = (tableNo: number) => ({ ...unattended, ticketKey: `t-${tableNo}`, tableNo, ready: { kitchen: 0, bar: 2 } })
    fetchMock.mockImplementation(async (url: string) => (url.startsWith('/api/tickets')
      ? {
          tickets: [unattended, ready(2), ready(4)],
          assignments: [{ tableNo: 2, ...ANNA, assignedAt: '2026-10-16T18:00:00.000Z' }],
          tableRange: { from: 1, to: 4 },
          serverNow: new Date().toISOString(),
        }
      : {}))
    const w = await open('waiter')
    // Table 2 is anna's own and already in her grid; table 3 has nothing ready.
    expect(w.findAll('[data-test="ready-elsewhere-table"]').map((r) => r.text().match(/\d+/)![0])).toEqual(['4'])
    await w.get('[data-test="owner-all"]').trigger('click')
    expect(w.find('[data-test="ready-elsewhere"]').exists()).toBe(false)
  })
})

describe('short guide', () => {
  it('opens once per account on this device and closes with "Los geht\'s"', async () => {
    const w = await open('waiter')
    expect(w.get('[data-test="welcome"]').text()).toContain('staff.welcome.order.title')
    await w.get('[data-test="welcome-close"]').trigger('click')
    expect(w.find('[data-test="welcome"]').exists()).toBe(false)
    expect((await open('waiter')).find('[data-test="welcome"]').exists()).toBe(false)
    // A helper who joins the next fest gets a new account: the guide comes again.
    useAuthStore().staff = { staffId: 'next-year', username: 'anna', role: 'waiter', theme: 'system' }
    const again = mount(OverviewPage, { global: { stubs } })
    await flushPromises()
    expect(again.find('[data-test="welcome"]').exists()).toBe(true)
    again.get('[data-test="welcome-close"]').trigger('click')
  })

  it('is not shown to admins unasked, but opens on request', async () => {
    const w = await open('admin')
    expect(w.find('[data-test="welcome"]').exists()).toBe(false)
    useWelcome().show()
    await flushPromises()
    expect(w.find('[data-test="welcome"]').exists()).toBe(true)
    await w.get('[data-test="welcome-close"]').trigger('click')
  })

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const w = await open('lead')
    await w.get('[data-test="welcome-close"]').trigger('click')
    expect(w.find('[data-test="welcome"]').exists()).toBe(false)
    vi.restoreAllMocks()
  })
})
