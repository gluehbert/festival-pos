import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { useAuthStore } from '~/stores/auth'
import AccountPage from '~/pages/staff/account.vue'
import { useCookie } from './setup/imports'
import { apiFailure } from './setup/api-error'

const fetchMock = vi.fn()
const stubs = { NuxtLink: RouterLinkStub }

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
  useAuthStore().staff = { staffId: 's', username: 'alice', role: 'admin', theme: 'system' }
})
afterEach(() => vi.unstubAllGlobals())

const wrong = apiFailure(400, 'WRONG_SECRET', { message: 'wrong' })

describe('auth store: changePassword', () => {
  it('reports success, a wrong password, the throttle and other failures', async () => {
    const auth = useAuthStore()
    fetchMock.mockResolvedValueOnce({ ok: true })
    expect(await auth.changePassword('old', 'new-password-1')).toBe('ok')
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/password')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { current: 'old', next: 'new-password-1' } })
    fetchMock.mockRejectedValueOnce(wrong)
    expect(await auth.changePassword('x', 'new-password-1')).toBe('wrong')
    fetchMock.mockRejectedValueOnce(apiFailure(429, 'RATE_LIMITED'))
    expect(await auth.changePassword('x', 'new-password-1')).toBe('rateLimited')
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await auth.changePassword('x', 'new-password-1')).toBe('failed')
  })
})

describe('account page', () => {
  async function fill(w: ReturnType<typeof mount>, current: string, next: string, repeat = next) {
    await w.get('#pw-current').setValue(current)
    await w.get('#pw-next').setValue(next)
    await w.get('#pw-repeat').setValue(repeat)
    await w.get('[data-test="password-form"]').trigger('submit')
    await flushPromises()
  }

  it('shows who is signed in and links to the passkeys', () => {
    const w = mount(AccountPage, { global: { stubs } })
    expect(w.get('[data-test="account-who"]').text()).toContain('"name":"alice"')
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toContain('/staff/passkeys')
  })

  it('offers the password form to admins only', () => {
    useAuthStore().staff = { staffId: 's', username: 'bob', role: 'waiter', theme: 'system' }
    const w = mount(AccountPage, { global: { stubs } })
    expect(w.find('[data-test="password-form"]').exists()).toBe(false)
    expect(w.find('[data-test="account-passkeys"]').exists()).toBe(true)
  })

  it('checks length and repetition before asking the server', async () => {
    const w = mount(AccountPage, { global: { stubs } })
    await fill(w, 'old', 'kurz')
    expect(w.get('[data-test="password-notice"]').text()).toContain('staff.account.tooShort')
    await fill(w, 'old', 'new-password-1', 'new-password-2')
    expect(w.get('[data-test="password-notice"]').text()).toBe('staff.account.mismatch')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('saves, clears the fields and reports a wrong current password', async () => {
    const w = mount(AccountPage, { global: { stubs } })
    fetchMock.mockRejectedValueOnce(wrong)
    await fill(w, 'wrong-pw', 'new-password-1')
    expect(w.get('[data-test="password-notice"]').text()).toBe('staff.account.result.wrong')
    expect(w.get('[data-test="password-notice"]').attributes('role')).toBe('alert')

    fetchMock.mockResolvedValueOnce({ ok: true })
    await fill(w, 'right', 'new-password-1')
    expect(w.get('[data-test="password-notice"]').text()).toBe('staff.account.result.ok')
    expect((w.get('#pw-next').element as HTMLInputElement).value).toBe('')
  })
})
