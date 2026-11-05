import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import SetupGuideBar from '~/components/admin/event/SetupGuideBar.vue'
import SetupChecklist from '~/components/admin/event/SetupChecklist.vue'
import { resetSetupGuide } from '~/composables/useSetupGuide'
import { nextStep, openSteps, prevStep, stepAt, stepDetail, stepDone } from '~/utils/setup-steps'
import type { EventDto } from '~/../server/lib/contracts/admin'
import type { Setup } from '~/../server/lib/contracts/setup'
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
const facts = { branded: false, menuItems: 0, priceRules: 0, helpers: 0, qrDownloadedAt: null, trialHeldAt: null }
const setup = (over: Partial<Setup['facts']> = {}, confirmed: Setup['confirmed'] = []): Setup => ({ confirmed, facts: { ...facts, ...over } })
const none = setup()
const stubs = { NuxtLink: RouterLinkStub }

describe('setup steps', () => {
  it('ticks steps off from the data, the rest once confirmed', () => {
    expect(stepDone('menu', ev(), null)).toBe(false)
    expect(stepDone('menu', ev(), none)).toBe(false)
    expect(stepDone('menu', ev(), setup({ menuItems: 3 }))).toBe(true)
    expect(stepDone('branding', ev(), none)).toBe(false)
    expect(stepDone('branding', ev(), setup({ branded: true }))).toBe(true)
    expect(stepDone('branding', ev(), setup({}, ['branding']))).toBe(true)
    expect(stepDone('staff', ev(), setup({ helpers: 2 }))).toBe(true)
    // "Weiter" alone puts no codes on the tables.
    expect(stepDone('qr', ev(), setup({}, ['qr']))).toBe(false)
    expect(stepDone('qr', ev(), setup({ qrDownloadedAt: '2026-11-03T18:00:00.000Z' }))).toBe(true)
  })

  it('ticks off the start only when live after a rehearsal', () => {
    const held = setup({ trialHeldAt: '2026-11-04T18:00:00.000Z' })
    expect(stepDone('start', ev({ isActive: true }), none)).toBe(false)
    expect(stepDetail('start', ev({ isActive: true }), none)).toEqual({ key: 'noTrial', values: {} })
    expect(stepDone('start', ev({ isActive: true, trialMode: true }), held)).toBe(false)
    expect(stepDone('start', ev({ isActive: true }), held)).toBe(true)
    expect(stepDetail('start', ev({ isActive: true }), held)).toEqual({ key: 'trialHeld', values: { date: '2026-11-04T18:00:00.000Z' } })
  })

  it('says per step what the data shows', () => {
    expect(stepDetail('menu', ev(), setup({ menuItems: 12 }))).toEqual({ key: 'menuItems', values: { n: 12 } })
    expect(stepDetail('staff', ev(), setup({ helpers: 5 }))).toEqual({ key: 'helpers', values: { n: 5 } })
    expect(stepDetail('settings', ev(), none)).toEqual({ key: 'tables', values: { from: 1, to: 20 } })
    expect(stepDetail('pricing', ev(), none)).toBeNull()
    expect(stepDetail('menu', ev(), null)).toBeNull()
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
  let server: Setup
  beforeEach(() => {
    resetSetupGuide()
    localStorage.clear()
    server = setup()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string, opts?: { method?: string; body?: { steps: Setup['confirmed'] } }) => {
      if (url === '/api/csrf-token') return { csrfToken: 'c'.repeat(64) }
      if (url === `/api/admin/events/${ID}/setup` && opts?.method === 'POST') {
        server = { ...server, confirmed: [...new Set([...server.confirmed, ...opts.body!.steps])] }
        return server
      }
      if (url === `/api/admin/events/${ID}/setup`) return server
      return { eventId: ID, items: [] }
    })
    vi.stubGlobal('$fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const posts = () => fetchMock.mock.calls.filter(([url, o]) => url === `/api/admin/events/${ID}/setup` && o?.method === 'POST').map(([, o]) => o.body)

  it('"Next" ticks the step off on the server and opens the next tab', async () => {
    const w = mount(SetupGuideBar, { props: { event: ev(), subPath: '/branding' }, global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('admin.setup.stepOf')
    await w.find('[data-test="setup-next"]').trigger('click')
    await flushPromises()
    expect(posts()).toEqual([{ steps: ['branding'] }])
    expect(navigateTo).toHaveBeenCalledWith(`/admin/events/${ID}/settings`)
    expect(w.find('[data-step="branding"]').attributes('data-done')).toBe('true')
    // Nothing of it stays in this browser: another device sees the same.
    expect(localStorage.getItem(`setup-confirmed:${ID}`)).toBeNull()
  })

  it('sends ticks an earlier version kept in the browser to the server once', async () => {
    localStorage.setItem(`setup-confirmed:${ID}`, JSON.stringify(['branding', 'settings', 'nonsense']))
    mount(SetupChecklist, { props: { event: ev() }, global: { stubs } })
    await flushPromises()
    expect(posts()).toEqual([{ steps: ['branding', 'settings'] }])
    expect(localStorage.getItem(`setup-confirmed:${ID}`)).toBeNull()
  })

  it('hides while the festival runs for real, and on request', async () => {
    const live = mount(SetupGuideBar, { props: { event: ev({ isActive: true, activatedAt: '2026-06-13T10:00:00.000Z' }), subPath: '' }, global: { stubs } })
    expect(live.find('[data-test="setup-guide"]').exists()).toBe(false)

    const w = mount(SetupGuideBar, { props: { event: ev(), subPath: '/menu' }, global: { stubs } })
    await flushPromises()
    await w.find('[data-test="setup-hide"]').trigger('click')
    expect(w.find('[data-test="setup-guide"]').exists()).toBe(false)
    expect(localStorage.getItem(`setup-hidden:${ID}`)).toBe('1')

    const list = mount(SetupChecklist, { props: { event: ev() }, global: { stubs } })
    await flushPromises()
    await list.find('[data-test="setup-show"]').trigger('click')
    expect(localStorage.getItem(`setup-hidden:${ID}`)).toBeNull()
  })

  it('on a tab outside the guide, points to the first open step', async () => {
    server = setup({}, ['branding', 'settings'])
    const w = mount(SetupGuideBar, { props: { event: ev(), subPath: '/reports' }, global: { stubs } })
    await flushPromises()
    const links = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(links.at(-1)).toBe(`/admin/events/${ID}/menu`)
  })

  it('the overview checklist shows what is done, what is open and the numbers', async () => {
    server = setup({ menuItems: 12, branded: true })
    const w = mount(SetupChecklist, { props: { event: ev() }, global: { stubs } })
    await flushPromises()
    expect(w.find('[data-step="branding"] [data-icon="i-lucide-check"]').exists()).toBe(true)
    expect(w.find('[data-step="menu"] [data-icon="i-lucide-check"]').exists()).toBe(true)
    expect(w.find('[data-step="staff"] [data-icon="i-lucide-check"]').exists()).toBe(false)
    expect(w.find('[data-detail="menu"]').text()).toContain('admin.setup.detail.menuItems')
    expect(w.find('[data-test="setup-open-count"]').text()).toContain('admin.setup.openCount')
  })
})
