import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GuestLimitsPanel from '~/components/admin/GuestLimitsPanel.vue'
import ShiftEndPanel from '~/components/staff/ShiftEndPanel.vue'
import ItemRow from '~/components/staff/ItemRow.vue'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'
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

describe('guest abuse protection in the UI', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('the admin changes the open limits per phone; empty means no limit', async () => {
    const admin = useAdminStore()
    admin.events = [ev()]
    const w = mount(GuestLimitsPanel, { props: { event: ev() } })
    expect((w.get('input[name="bar"]').element as HTMLInputElement).value).toBe('50')
    expect((w.get('input[name="kitchen"]').element as HTMLInputElement).value).toBe('80')

    await w.get('input[name="bar"]').setValue('30,50')
    await w.get('input[name="kitchen"]').setValue('')
    fetchMock.mockResolvedValueOnce({})
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(fetchMock.mock.calls[0]).toMatchObject([
      `/api/admin/events/${ID}/branding`,
      { method: 'PATCH', body: { guestOpenLimitBarCents: 3050, guestOpenLimitKitchenCents: null } },
    ])
    expect(admin.events[0]).toMatchObject({ guestOpenLimitBarCents: 3050, guestOpenLimitKitchenCents: null })
    expect(w.emitted('saved')).toEqual([['admin.guestLimits.saved']])
  })

  it('refuses amounts below 1 € and text', async () => {
    const w = mount(GuestLimitsPanel, { props: { event: ev() } })
    for (const value of ['0,50', 'lots']) {
      await w.get('input[name="bar"]').setValue(value)
      expect(w.get('button[type="submit"]').attributes('disabled')).toBeDefined()
      expect(w.get('[role="alert"]').text()).toBe('admin.guestLimits.invalid')
    }
    await w.get('form').trigger('submit')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('the shift lead signs out all guest phones after confirming', async () => {
    const w = mount(ShiftEndPanel)
    await w.get('[data-test="shift-end"] > button').trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce({ ended: 7 })
    await w.get('[data-test="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]).toMatchObject(['/api/tickets/guest-sessions/end', { method: 'POST' }])
    expect(w.get('[role="status"]').text()).toBe('staff.shiftEnd.done:{"n":7}')
    expect(w.find('[role="dialog"]').exists()).toBe(false)
  })

  it('says when signing out failed', async () => {
    const w = mount(ShiftEndPanel)
    await w.get('[data-test="shift-end"] > button').trigger('click')
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('500'), { statusCode: 500 }))
    await w.get('[data-test="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe('staff.shiftEnd.failed')
  })

  it('the bill line names the guest phone that ordered it', () => {
    const item = {
      orderItemId: 'i', orderId: 'o', menuItemId: 'm', nameDe: 'Bier', nameEn: 'Beer', quantity: 1, unitPriceCents: 400,
      depositCents: 0, paymentStatus: 'unpaid', productionStatus: 'done', note: null, served: false, device: 2,
    } as unknown as TicketDetailItem
    expect(mount(ItemRow, { props: { item } }).get('[data-test="order-device"]').text()).toBe('staff.ticket.device:{"n":2}')
    expect(mount(ItemRow, { props: { item: { ...item, device: null } } }).find('[data-test="order-device"]').exists()).toBe(false)
  })
})
