import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EventContextHeader from '~/components/admin/event/EventContextHeader.vue'
import { eventStatus } from '~/composables/useAdminPage'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'
import { fetchRefresh, useCookie } from './setup/imports'

const LIVE = '00000000-0000-4000-8000-000000000001'
const DRAFT = '00000000-0000-4000-8000-000000000002'
const ev = (over: Partial<EventDto> = {}): EventDto => ({
  id: DRAFT,
  name: 'Weihnachtsmarkt',
  pinCode: 'XMAS1',
  isActive: false,
  tableRangeFrom: 1,
  tableRangeTo: 20,
  createdAt: '2026-05-01T10:00:00.000Z',
  activatedAt: null,
  startsOn: null,
  endsOn: null,
  trialMode: false,
  trialOrders: 0,
  depositEnabled: false,
  staffMealsEnabled: false,
  ...over,
})

describe('eventStatus', () => {
  it('tells drafts, live events, rehearsals and ended events apart', () => {
    expect(eventStatus(ev())).toBe('draft')
    expect(eventStatus(ev({ isActive: true, activatedAt: '2026-05-02T10:00:00.000Z' }))).toBe('live')
    expect(eventStatus(ev({ isActive: true, trialMode: true }))).toBe('trial')
    expect(eventStatus(ev({ activatedAt: '2026-05-02T10:00:00.000Z' }))).toBe('ended')
  })
})

describe('EventContextHeader', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    fetchRefresh.mockClear()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  const live = ev({ id: LIVE, name: 'Summer Fair', isActive: true, activatedAt: '2026-05-02T10:00:00.000Z' })

  it('names the edited event, says it is a draft and which event is live', () => {
    const w = mount(EventContextHeader, { props: { event: ev(), live } })
    expect(w.text()).toContain('admin.workspace.editing')
    expect(w.text()).toContain('Weihnachtsmarkt')
    expect(w.text()).toContain('admin.status.draft')
    expect(w.text()).toContain('admin.workspace.hint.draft')
    expect(w.text()).toContain('admin.workspace.currentlyLive')
  })

  it('asks before switching the live event, then activates', async () => {
    const admin = useAdminStore()
    admin.events = [live, ev()]
    const w = mount(EventContextHeader, { props: { event: ev(), live } })
    await w.find('button').trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(w.text()).toContain('admin.workspace.confirmEnds')

    fetchMock.mockResolvedValueOnce(ev({ isActive: true, activatedAt: '2026-10-13T10:00:00.000Z' }))
    await w.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/events/${DRAFT}/activate`)
    expect(fetchRefresh).toHaveBeenCalled()
    expect(admin.events.find((e) => e.id === LIVE)?.isActive).toBe(false)
    expect(admin.events.find((e) => e.id === DRAFT)?.isActive).toBe(true)
  })

  it('shows no activation for the live event', () => {
    const w = mount(EventContextHeader, { props: { event: live, live }, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    expect(w.text()).toContain('admin.workspace.hint.live')
    expect(w.findAll('button')).toHaveLength(0)
  })
})
