import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EventTablesPanel from '~/components/admin/EventTablesPanel.vue'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'
import { useCookie } from './setup/imports'

const ID = '00000000-0000-4000-8000-000000000001'
const ev = (over: Partial<EventDto> = {}): EventDto => ({
  id: ID,
  name: 'Summer Fair',
  pinCode: 'SF2026',
  isActive: true,
  tableRangeFrom: 1,
  tableRangeTo: 10,
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

describe('EventTablesPanel', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('adds a table to a live event and updates the event', async () => {
    const admin = useAdminStore()
    admin.events = [ev()]
    const w = mount(EventTablesPanel, { props: { event: ev() } })
    await w.get('input[name="to"]').setValue(11)
    fetchMock.mockResolvedValueOnce(ev({ tableRangeTo: 11 }))
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(fetchMock.mock.calls[0]).toMatchObject([`/api/admin/events/${ID}/tables`, { method: 'PUT', body: { tableRangeFrom: 1, tableRangeTo: 11 } }])
    expect(admin.events[0]!.tableRangeTo).toBe(11)
    expect(w.emitted('saved')).toEqual([['admin.tables.saved:{"from":1,"to":11}']])
  })

  it('names the tables that still have open bills', async () => {
    const w = mount(EventTablesPanel, { props: { event: ev() } })
    await w.get('input[name="to"]').setValue(8)
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('409'), { statusCode: 409, data: { code: 'TABLES_OPEN', details: { tableNos: [9, 10] } } }))
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('failed')).toEqual([['admin.tables.open:{"tables":"9, 10"}']])
  })
})
