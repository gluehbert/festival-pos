import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EventTrialPanel from '~/components/admin/EventTrialPanel.vue'
import EventFeaturesPanel from '~/components/admin/EventFeaturesPanel.vue'
import { useAdminStore } from '~/stores/admin'
import { useFormat } from '~/composables/useFormat'
import type { EventDto } from '~/../server/lib/contracts/admin'
import { fetchRefresh, locale, useCookie } from './setup/imports'

const ID = '00000000-0000-4000-8000-000000000001'
const ev = (over: Partial<EventDto> = {}): EventDto => ({
  id: ID,
  name: 'Summer Fair',
  pinCode: 'SF2026',
  isActive: true,
  tableRangeFrom: 1,
  tableRangeTo: 20,
  createdAt: '2026-05-01T10:00:00.000Z',
  activatedAt: '2026-05-01T10:00:00.000Z',
  deactivatedAt: null,
  startsOn: null,
  endsOn: null,
  trialMode: false,
  trialOrders: 0,
  depositEnabled: false,
  staffMealsEnabled: false,
  guestOpenLimitBarCents: 5000,
  guestOpenLimitKitchenCents: 8000,
  ...over,
})

describe('useFormat.eventDates', () => {
  it('formats single days and ranges without time zone shifts', () => {
    const f = useFormat()
    expect(f.eventDates(null, null)).toBeNull()
    expect(f.eventDates('2026-06-13', null)).toBe('Sat 13 June 2026')
    expect(f.eventDates('2026-06-13', '2026-06-13')).toBe('Sat 13 June 2026')
    expect(f.eventDates('2026-06-13', '2026-06-14')).toMatch(/^Sat 13\s–\sSun 14 June 2026$/)
    locale.value = 'de'
    // German literal on purpose: second locale.
    expect(f.eventDates('2026-06-13', '2026-06-14')).toMatch(/^Sa\., 13\.\s–\sSo\., 14\. Juni 2026$/)
  })
})

describe('EventTrialPanel', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    fetchRefresh.mockClear()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  const buttons = (w: ReturnType<typeof mount>) => w.findAll('button').map((b) => b.text())

  it('starts a rehearsal and refreshes the public banner', async () => {
    const w = mount(EventTrialPanel, { props: { event: ev() } })
    expect(buttons(w)).toEqual(['admin.trial.start'])
    fetchMock.mockResolvedValueOnce(ev({ trialMode: true }))
    await w.find('button').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]).toMatchObject([`/api/admin/events/${ID}/trial`, { method: 'PUT', body: { enabled: true } }])
    expect(fetchRefresh).toHaveBeenCalled()
    expect(w.emitted('saved')).toEqual([['admin.trial.started']])
  })

  it('ends a rehearsal only after confirming the deletion of test data', async () => {
    const w = mount(EventTrialPanel, { props: { event: ev({ trialMode: true, trialOrders: 3 }) } })
    expect(buttons(w)).toEqual(['admin.trial.deleteData', 'admin.trial.end'])
    await w.findAll('button')[1]!.trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(w.find('[role="alert"]').text()).toContain('admin.trial.confirmEnd')
    await w.findAll('button')[1]!.trigger('click') // cancel
    expect(w.find('[role="alert"]').exists()).toBe(false)

    await w.findAll('button')[1]!.trigger('click')
    fetchMock
      .mockResolvedValueOnce({ deletedOrders: 3, deletedPayments: 1, event: ev({ trialMode: true }) })
      .mockResolvedValueOnce(ev())
    await w.find('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls.map(([path, opts]) => [path, (opts as { method: string }).method])).toEqual([
      [`/api/admin/events/${ID}/trial-data`, 'DELETE'],
      [`/api/admin/events/${ID}/trial`, 'PUT'],
    ])
    expect(w.emitted('saved')).toEqual([['admin.trial.ended']])
  })

  it('ends an empty rehearsal directly, deletes leftovers and reports failures', async () => {
    const empty = mount(EventTrialPanel, { props: { event: ev({ trialMode: true }) } })
    fetchMock.mockResolvedValueOnce(ev())
    await empty.find('button').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(empty.emitted('saved')).toEqual([['admin.trial.ended']])

    const leftover = mount(EventTrialPanel, { props: { event: ev({ trialOrders: 2 }) } })
    expect(leftover.text()).toContain('admin.trial.leftover')
    await leftover.findAll('button')[1]!.trigger('click')
    fetchMock.mockRejectedValueOnce(new Error('down'))
    await leftover.find('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(leftover.emitted('failed')).toEqual([['admin.toast.actionFailed']])
    expect(leftover.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('EventFeaturesPanel', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    fetchRefresh.mockClear()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('switches deposit on, updates the event and the public branding', async () => {
    const admin = useAdminStore()
    admin.events = [ev()]
    const w = mount(EventFeaturesPanel, { props: { event: ev() } })
    expect(w.get('[data-feature="depositEnabled"]').attributes('aria-checked')).toBe('false')
    fetchMock.mockResolvedValueOnce({})
    await w.get('[data-feature="depositEnabled"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]).toMatchObject([`/api/admin/events/${ID}/branding`, { method: 'PATCH', body: { depositEnabled: true } }])
    expect(admin.events[0]!.depositEnabled).toBe(true)
    expect(fetchRefresh).toHaveBeenCalled()
    expect(w.emitted('saved')).toEqual([['admin.features.saved']])
  })

  it('reports a failed save', async () => {
    const w = mount(EventFeaturesPanel, { props: { event: ev() } })
    fetchMock.mockRejectedValueOnce(new Error('down'))
    await w.get('[data-feature="staffMealsEnabled"]').trigger('click')
    await flushPromises()
    expect(w.emitted('failed')).toEqual([['admin.toast.actionFailed']])
  })
})
