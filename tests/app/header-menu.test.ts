import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { useAuthStore, type StaffRole } from '~/stores/auth'
import { resetAttention, useAttention } from '~/composables/useAttention'
import HeaderMenu from '~/components/common/HeaderMenu.vue'
import AlertBell from '~/components/common/AlertBell.vue'
import LocaleSwitcher from '~/components/common/LocaleSwitcher.vue'
import ServiceActions from '~/components/staff/ServiceActions.vue'
import { useDeviceMode } from '~/composables/useDeviceMode'
import { useWelcome } from '~/composables/useWelcome'
import { locale, navigateTo, useCookie } from './setup/imports'

const route = { path: '/staff' }
vi.mock('vue-router', () => ({ useRoute: () => route }))

const fetchMock = vi.fn()
// The popover renders trigger and content inline, so tests see both.
const stubs = {
  NuxtLink: RouterLinkStub,
  UPopover: { template: '<div><slot /><slot name="content" :close="() => {}" /></div>' },
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'x'.repeat(64)
  resetAttention()
  localStorage.clear()
  route.path = '/staff'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function signIn(role: StaffRole) {
  useAuthStore().staff = { staffId: 's', username: 'alice', role, theme: 'system' }
}

const targets = (w: ReturnType<typeof mount>) => w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))

describe('HeaderMenu', () => {
  it('offers guests only language and colours', () => {
    const w = mount(HeaderMenu, { global: { stubs } })
    expect(w.find('[data-icon="i-lucide-globe"]').exists()).toBe(true)
    expect(w.find('[data-test="locale-switcher"]').exists()).toBe(true)
    expect(w.find('[data-test="theme-switcher"]').exists()).toBe(true)
    expect(targets(w)).toEqual([])
    expect(w.find('[data-test="logout"]').exists()).toBe(false)
  })

  // Tells at a glance whether a device still runs an old deployment.
  it('shows the build version', () => {
    const w = mount(HeaderMenu, { global: { stubs } })
    expect(w.find('[data-test="app-version"]').text()).toContain('abc1234')
  })

  it('gives a waiter the account and cash, but no other areas', () => {
    signIn('waiter')
    const w = mount(HeaderMenu, { global: { stubs } })
    expect(targets(w)).toEqual(['/staff/account', '/staff/cash'])
  })

  it('shows who is signed in as a link to the own account', () => {
    signIn('waiter')
    const w = mount(HeaderMenu, { global: { stubs } })
    const account = w.get('[data-test="menu-account"]')
    expect(account.text()).toContain('alice')
    expect(account.text()).toContain('admin.staff.roles.waiter')
    expect(account.text()).toContain('nav.myAccount')
    expect(account.text()).toContain('A')
  })

  it('gives kitchen staff only the account, without the device switch', () => {
    signIn('kitchen')
    const w = mount(HeaderMenu, { global: { stubs } })
    expect(targets(w)).toEqual(['/staff/account'])
    expect(w.find('[data-test="device-mode"]').exists()).toBe(false)
  })

  it('opens the short guide on the service screen for those serving tables', async () => {
    signIn('waiter')
    const w = mount(HeaderMenu, { global: { stubs } })
    await w.get('[data-test="menu-guide"]').trigger('click')
    await flushPromises()
    expect(useWelcome().open.value).toBe(true)
    expect(navigateTo).toHaveBeenCalledWith('/staff')
    useWelcome().dismiss('s')
    signIn('kitchen')
    expect(mount(HeaderMenu, { global: { stubs } }).find('[data-test="menu-guide"]').exists()).toBe(false)
  })

  it('leaves the device switch to the shift lead and admin', () => {
    signIn('waiter')
    expect(mount(HeaderMenu, { global: { stubs } }).find('[data-test="device-mode"]').exists()).toBe(false)
  })

  it('remembers on the device whether it is a waiter phone or the counter', async () => {
    signIn('lead')
    const w = mount(HeaderMenu, { global: { stubs } })
    expect(w.get('[data-mode="service"]').attributes('aria-checked')).toBe('true')
    await w.get('[data-mode="counter"]').trigger('click')
    expect(localStorage.getItem('device-mode')).toBe('counter')
    useDeviceMode().setMode('service')
    localStorage.setItem('device-mode', 'counter')
    useDeviceMode().restore()
    expect(useDeviceMode().mode.value).toBe('counter')
    useDeviceMode().setMode('service')
  })

  it('lets an admin switch areas and marks the current one', () => {
    signIn('admin')
    route.path = '/admin/events/e1'
    const w = mount(HeaderMenu, { global: { stubs } })
    expect(targets(w)).toEqual(['/staff/account', '/staff', '/production', '/admin/events', '/staff/cash'])
    expect(w.get('[data-test="menu-link-/admin/events"]').classes()).toContain('font-semibold')
    expect(w.get('[data-test="menu-link-/staff"]').classes()).not.toContain('font-semibold')
  })

  it('signs out and goes to the login page', async () => {
    signIn('waiter')
    fetchMock.mockResolvedValueOnce({})
    const w = mount(HeaderMenu, { global: { stubs } })
    await w.get('[data-test="logout"]').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.anything())
    expect(useAuthStore().isAuthenticated).toBe(false)
    expect(navigateTo).toHaveBeenCalledWith('/staff/login')
  })
})

describe('LocaleSwitcher', () => {
  it('marks the current language and switches', async () => {
    const w = mount(LocaleSwitcher)
    expect(w.get('[data-locale="en"]').attributes('aria-checked')).toBe('true')
    await w.get('[data-locale="de"]').trigger('click')
    expect(locale.value).toBe('de')
    expect(w.get('[data-locale="de"]').attributes('aria-checked')).toBe('true')
  })
})

describe('AlertBell', () => {
  it('shows the sound state and holds the switches', async () => {
    const w = mount(AlertBell, { global: { stubs } })
    expect(w.get('[data-test="alert-bell"]').attributes('data-state')).toBe('locked')
    expect(w.find('[data-test="sound-toggle"]').exists()).toBe(true)

    localStorage.setItem('alert-sound', 'off')
    resetAttention()
    useAttention().init()
    await w.vm.$nextTick()
    expect(w.get('[data-test="alert-bell"]').attributes('data-state')).toBe('off')
    expect(w.find('[data-icon="i-lucide-bell-off"]').exists()).toBe(true)
  })
})

describe('ServiceActions', () => {
  const main = (mode: 'service' | 'counter', deposit = true, staffMeals = true) => mount(ServiceActions, { props: { mode, deposit, staffMeals }, global: { stubs } })
    .findAllComponents(RouterLinkStub).map((l) => l.props('to'))

  it('gives the device\'s main job the big button', () => {
    expect(main('service').slice(0, 2)).toEqual(['/staff/order', '/staff/order?walkin=1'])
    expect(main('counter').slice(0, 2)).toEqual(['/staff/order?walkin=1', '/staff/order'])
    expect(main('service')).toContain('/staff/deposit')
  })

  it('leaves out deposit and helper meals when the event does not use them', () => {
    expect(main('service', false, false)).toEqual(['/staff/order', '/staff/order?walkin=1'])
    expect(main('service', true, false)).toEqual(['/staff/order', '/staff/order?walkin=1', '/staff/deposit'])
    expect(main('service', false, true)).toEqual(['/staff/order', '/staff/order?walkin=1', '/staff/order?meal=1'])
  })
})
