import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import SetupGuideBar from '~/components/admin/event/SetupGuideBar.vue'
import SetupChecklist from '~/components/admin/event/SetupChecklist.vue'
import { resetSetupGuide } from '~/composables/useSetupGuide'
import { useAdminStore } from '~/stores/admin'
import { nextStep, openSteps, prevStep, stepAt, stepDone } from '~/utils/setup-steps'
import type { EventDto } from '~/../server/lib/contracts/admin'
import { navigateTo } from './setup/imports'

const ID = '00000000-0000-4000-8000-000000000002'
const ev = (over: Partial<EventDto> = {}): EventDto => ({
  id: ID,
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
const none = { menuCount: 0, confirmed: new Set<never>() }
const stubs = { NuxtLink: RouterLinkStub }

describe('setup steps', () => {
  it('counts the menu and the real start from the data, the rest once confirmed', () => {
    expect(stepDone('menu', ev(), none)).toBe(false)
    expect(stepDone('menu', ev(), { ...none, menuCount: 3 })).toBe(true)
    expect(stepDone('start', ev({ isActive: true, trialMode: true }), none)).toBe(false)
    expect(stepDone('start', ev({ isActive: true }), none)).toBe(true)
    expect(stepDone('branding', ev(), none)).toBe(false)
    expect(stepDone('branding', ev(), { ...none, confirmed: new Set(['branding'] as const) })).toBe(true)
  })

  it('maps tabs to steps and leaves the optional one out of what is open', () => {
    expect(stepAt('/menu/')?.key).toBe('menu')
    expect(stepAt('')?.key).toBe('start')
    expect(stepAt('/reports')).toBeNull()
    expect(nextStep('menu')?.key).toBe('pricing')
    expect(prevStep('branding')).toBeNull()
    expect(nextStep('start')).toBeNull()
    expect(openSteps(ev(), none)).toEqual(['branding', 'settings', 'menu', 'staff', 'qr', 'start'])
  })
})

describe('setup guide', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    resetSetupGuide()
    localStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ eventId: ID, items: [] })
    vi.stubGlobal('$fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('"Next" ticks the step off, remembers it and opens the next tab', async () => {
    const w = mount(SetupGuideBar, { props: { event: ev(), subPath: '/branding' }, global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('admin.setup.stepOf')
    await w.find('[data-test="setup-next"]').trigger('click')
    expect(navigateTo).toHaveBeenCalledWith(`/admin/events/${ID}/settings`)
    expect(JSON.parse(localStorage.getItem(`setup-confirmed:${ID}`)!)).toEqual(['branding'])
    expect(w.find('[data-step="branding"]').attributes('data-done')).toBe('true')
  })

  it('hides while the festival runs for real, and on request', async () => {
    const live = mount(SetupGuideBar, { props: { event: ev({ isActive: true, activatedAt: '2026-06-13T10:00:00.000Z' }), subPath: '' }, global: { stubs } })
    expect(live.find('[data-test="setup-guide"]').exists()).toBe(false)

    const w = mount(SetupGuideBar, { props: { event: ev(), subPath: '/menu' }, global: { stubs } })
    await w.find('[data-test="setup-hide"]').trigger('click')
    expect(w.find('[data-test="setup-guide"]').exists()).toBe(false)
    expect(localStorage.getItem(`setup-hidden:${ID}`)).toBe('1')

    const list = mount(SetupChecklist, { props: { event: ev() }, global: { stubs } })
    await list.find('[data-test="setup-show"]').trigger('click')
    expect(localStorage.getItem(`setup-hidden:${ID}`)).toBeNull()
  })

  it('on a tab outside the guide, points to the first open step', async () => {
    localStorage.setItem(`setup-confirmed:${ID}`, JSON.stringify(['branding', 'settings']))
    const w = mount(SetupGuideBar, { props: { event: ev(), subPath: '/reports' }, global: { stubs } })
    await flushPromises()
    const links = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(links.at(-1)).toBe(`/admin/events/${ID}/menu`)
  })

  it('the overview checklist shows what is done and what is open', async () => {
    localStorage.setItem(`setup-confirmed:${ID}`, JSON.stringify(['branding']))
    const w = mount(SetupChecklist, { props: { event: ev() }, global: { stubs } })
    await flushPromises()
    useAdminStore().menuItems = [{ id: 'x' } as never]
    await flushPromises()
    expect(w.find('[data-step="branding"] [data-icon="i-lucide-check"]').exists()).toBe(true)
    expect(w.find('[data-step="menu"] [data-icon="i-lucide-check"]').exists()).toBe(true)
    expect(w.find('[data-step="staff"] [data-icon="i-lucide-check"]').exists()).toBe(false)
    expect(w.find('[data-test="setup-open-count"]').text()).toContain('admin.setup.openCount')
  })
})
