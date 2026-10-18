import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'
import EventEndPanel from '~/components/admin/EventEndPanel.vue'
import EventDeletePanel from '~/components/admin/EventDeletePanel.vue'
import EventContextHeader from '~/components/admin/event/EventContextHeader.vue'
import { useAdminStore } from '~/stores/admin'
import { ReportTypeEnum } from '~/../server/lib/contracts/reports'
import type { EndCheck, EventDto } from '~/../server/lib/contracts/admin'
import { useCookie } from './setup/imports'

const ID = '00000000-0000-4000-8000-000000000001'
const ev = (over: Partial<EventDto> = {}): EventDto => ({
  id: ID,
  name: 'Sommerfest',
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
  ...over,
})
const ended = () => ev({ isActive: false, deactivatedAt: '2026-06-15T22:00:00.000Z' })

const clean: EndCheck = { openTables: { count: 0, totalCents: 0, tableNos: [] }, openCashSessions: [], undeliveredItems: 0 }
const busy: EndCheck = {
  openTables: { count: 2, totalCents: 1850, tableNos: [3, 7] },
  openCashSessions: [{ username: 'anna', openedAt: '2026-06-14T16:00:00.000Z' }],
  undeliveredItems: 4,
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

const modal = (w: ReturnType<typeof mount>) => w.find('[data-test="confirm-dialog"]')
const confirmBtn = (w: ReturnType<typeof mount>) => w.find('[data-test="confirm-ok"]')

// Basics of the dialog are covered in dialogs.test.ts; this is the option the delete panel needs.
describe('ConfirmDialog', () => {
  it('blocks confirming while confirmDisabled or busy', async () => {
    const w = mount(ConfirmDialog, { props: { open: true, title: 'Title', confirmLabel: 'Yes', confirmDisabled: true }, slots: { default: '<p>Body</p>' } })
    expect(confirmBtn(w).attributes('disabled')).toBeDefined()
    await w.setProps({ confirmDisabled: false, busy: true })
    expect(confirmBtn(w).attributes('disabled')).toBeDefined()
    await w.setProps({ busy: false })
    expect(confirmBtn(w).attributes('disabled')).toBeUndefined()
  })
})

describe('EventEndPanel', () => {
  async function openDialog(check: EndCheck) {
    const admin = useAdminStore()
    admin.events = [ev()]
    const w = mount(EventEndPanel, { props: { event: ev() } })
    fetchMock.mockResolvedValueOnce(check)
    await w.find('[data-test="event-end-open"]').trigger('click')
    await flushPromises()
    return w
  }

  it('fetches the check list when opened and ends right away if nothing is open', async () => {
    const w = await openDialog(clean)
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/events/${ID}/end-check`)
    expect(modal(w).text()).toContain('admin.end.allClear')
    expect(modal(w).text()).not.toContain('admin.end.armed')
    expect(confirmBtn(w).text()).toBe('admin.end.confirm')

    fetchMock.mockResolvedValueOnce(ev({ isActive: false, deactivatedAt: '2026-06-15T22:00:00.000Z' }))
    await confirmBtn(w).trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[1]).toMatchObject([`/api/admin/events/${ID}/end`, { method: 'POST' }])
    expect(w.emitted('saved')).toEqual([['admin.end.done']])
    expect(useAdminStore().events[0]!.isActive).toBe(false)
  })

  it('lists what is open and needs a second tap with a warning', async () => {
    const w = await openDialog(busy)
    const text = modal(w).text()
    expect(text).toContain('admin.end.openTables')
    expect(text).toContain('3, 7')
    expect(text).toContain('anna')
    expect(text).toContain('admin.end.undelivered')
    expect(text).not.toContain('admin.end.allClear')
    expect(confirmBtn(w).text()).toBe('admin.end.confirmAnyway')
    expect(modal(w).text()).not.toContain('admin.end.armed')

    await confirmBtn(w).trigger('click')
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the check so far
    expect(modal(w).text()).toContain('admin.end.armed')

    fetchMock.mockResolvedValueOnce(ended())
    await confirmBtn(w).trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/admin/events/${ID}/end`)
  })

  it('reports a failed check or end without ending anything', async () => {
    const w = mount(EventEndPanel, { props: { event: ev() } })
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await w.find('[data-test="event-end-open"]').trigger('click')
    await flushPromises()
    expect(w.emitted('failed')).toHaveLength(1)
    expect(modal(w).exists()).toBe(false)
  })
})

describe('EventDeletePanel', () => {
  const okResponse = () => ({ ok: true, blob: async () => new Blob(['a;b']) })
  const fetchSpy = vi.fn()
  beforeEach(() => {
    fetchSpy.mockReset().mockImplementation(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
  })

  const deleteBtn = (w: ReturnType<typeof mount>) => w.find('[data-test="event-delete-open"]')

  it('keeps "delete" locked until every report was exported', async () => {
    const w = mount(EventDeletePanel, { props: { event: ended() } })
    expect(deleteBtn(w).attributes('disabled')).toBeDefined()
    await w.find('[data-test="event-export"]').trigger('click')
    await flushPromises()
    expect(fetchSpy).toHaveBeenCalledTimes(ReportTypeEnum.options.length)
    for (const type of ReportTypeEnum.options) {
      expect(fetchSpy.mock.calls.map((c) => c[0])).toContain(`/api/admin/events/${ID}/reports?type=${type}&format=csv`)
    }
    expect(deleteBtn(w).attributes('disabled')).toBeUndefined()
  })

  it('stays locked when one report fails to download', async () => {
    fetchSpy.mockImplementationOnce(async () => ({ ok: false, status: 500 }))
    const w = mount(EventDeletePanel, { props: { event: ended() } })
    await w.find('[data-test="event-export"]').trigger('click')
    await flushPromises()
    expect(deleteBtn(w).attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('admin.delete.exportFailed')
  })

  it('needs the exact event name before deleting', async () => {
    const admin = useAdminStore()
    admin.events = [ended()]
    const w = mount(EventDeletePanel, { props: { event: ended() } })
    await w.find('[data-test="event-export"]').trigger('click')
    await flushPromises()
    await deleteBtn(w).trigger('click')
    expect(modal(w).text()).toContain('admin.delete.warning')
    expect(confirmBtn(w).attributes('disabled')).toBeDefined()

    await w.find('[data-test="event-delete-name"]').setValue('sommerfest')
    expect(confirmBtn(w).attributes('disabled')).toBeDefined()
    await confirmBtn(w).trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()

    await w.find('[data-test="event-delete-name"]').setValue('Sommerfest')
    expect(confirmBtn(w).attributes('disabled')).toBeUndefined()
    fetchMock.mockResolvedValueOnce({ deleted: true, orders: 3, payments: 2 })
    await confirmBtn(w).trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]).toMatchObject([`/api/admin/events/${ID}`, { method: 'DELETE' }])
    expect(w.emitted('deleted')).toHaveLength(1)
    admin.dropEvent(ID)
    expect(admin.events).toEqual([])
  })

  it('does not offer deletion of a live event', () => {
    const w = mount(EventDeletePanel, { props: { event: ev() } })
    expect(deleteBtn(w).exists()).toBe(false)
  })
})

describe('EventContextHeader while another event is live', () => {
  const stubs = { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
  const draft = ev({ id: '00000000-0000-4000-8000-000000000002', name: 'Neu', isActive: false, activatedAt: null })

  it('asks to end the running event first instead of activating', () => {
    const w = mount(EventContextHeader, { props: { event: draft, live: ev() }, global: { stubs } })
    expect(w.text()).toContain('admin.workspace.endLiveFirst')
    expect(w.find(`a[href="/admin/events/${ID}"]`).exists()).toBe(true)
    expect(w.findAll('button')).toHaveLength(0)
  })

  it('offers activation when nothing is live', () => {
    const w = mount(EventContextHeader, { props: { event: draft, live: null }, global: { stubs } })
    expect(w.findAll('button')).toHaveLength(1)
    expect(w.text()).not.toContain('admin.workspace.endLiveFirst')
  })
})
