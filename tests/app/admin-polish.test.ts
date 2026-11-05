import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EventFeaturesPanel from '~/components/admin/EventFeaturesPanel.vue'
import EventContextHeader from '~/components/admin/event/EventContextHeader.vue'
import PasskeyOffer from '~/components/staff/PasskeyOffer.vue'
import { useAuthStore } from '~/stores/auth'
import type { EventDto } from '~/../server/lib/contracts/admin'

const route = { path: '/admin/events' }
vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => true, startRegistration: vi.fn(), startAuthentication: vi.fn() }))

const ev = (over: Partial<EventDto> = {}): EventDto => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Sommerfest',
  pinCode: 'SF2026',
  isActive: false,
  tableRangeFrom: 1,
  tableRangeTo: 20,
  createdAt: '2026-05-01T10:00:00.000Z',
  activatedAt: null,
  deactivatedAt: null,
  startsOn: null,
  endsOn: null,
  trialMode: false,
  trialOrders: 0,
  depositEnabled: false,
  staffMealsEnabled: false,
  waiterCallsEnabled: false,
  foodPrepayEnabled: false,
  guestOpenLimitBarCents: 5000,
  guestOpenLimitKitchenCents: 8000,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal('$fetch', vi.fn(async () => ({ kitchen: [], bar: [], cafe: [] })))
  localStorage.clear()
})

describe('admin texts for once-a-year use', () => {
  it('each feature says one sentence; the details wait behind "More"', () => {
    const w = mount(EventFeaturesPanel, { props: { event: ev() } })
    const details = w.findAll('details')
    // Deposit, waiter calls, food prepay, cafe closed and buzzers; staff meals needs none.
    expect(details).toHaveLength(6)
    expect(details[0]!.text()).toContain('admin.features.depositEnabled.more')
    expect(w.text()).not.toContain('admin.features.staffMealsEnabled.more')
  })

  it('the event header says what the PIN is for', () => {
    const w = mount(EventContextHeader, { props: { event: ev(), live: null }, global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    expect(w.find('[data-test="pin-hint"]').text()).toContain('admin.events.pinHint')
  })

  it('the passkey offer is one quiet line in the admin area', async () => {
    useAuthStore().staff = { staffId: 's', username: 'boss', role: 'admin' } as never
    route.path = '/admin/events'
    const admin = mount(PasskeyOffer)
    await admin.vm.$nextTick()
    expect(admin.text()).toContain('staff.passkeys.offerQuiet')
    expect(admin.text()).not.toContain('staff.passkeys.offerText')
    expect(admin.find('[data-test="passkey-offer-setup"]').classes()).not.toContain('bg-brand')

    route.path = '/staff'
    const staff = mount(PasskeyOffer)
    await staff.vm.$nextTick()
    expect(staff.text()).toContain('staff.passkeys.offerText')
  })
})
