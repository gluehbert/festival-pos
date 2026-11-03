import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PreviewLogin from '~/components/staff/PreviewLogin.vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo, useCookie } from './setup/imports'
import { apiFailure } from './setup/api-error'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

describe('PreviewLogin', () => {
  it('offers every role and the guest', () => {
    const w = mount(PreviewLogin)
    expect(w.findAll('button').map((b) => b.attributes('data-test'))).toEqual([
      'preview-login-waiter', 'preview-login-lead', 'preview-login-kitchen', 'preview-login-bar', 'preview-login-cafe', 'preview-login-admin', 'preview-login-guest',
    ])
  })

  it('signs in as staff, loads the session and goes to the home page', async () => {
    const session = { staffId: 's', username: 'preview-bar', role: 'bar', theme: 'system' }
    fetchMock.mockImplementation(async (url: string) => (url === '/api/preview/login' ? { to: '/production' } : session))
    const w = mount(PreviewLogin)
    await w.get('[data-test="preview-login-bar"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { as: 'bar' } })
    expect(useAuthStore().staff?.username).toBe('preview-bar')
    expect(navigateTo).toHaveBeenCalledWith('/production')
  })

  it('seats a guest without a staff session and reports failures', async () => {
    fetchMock.mockResolvedValueOnce({ to: '/t/3' })
    const w = mount(PreviewLogin)
    await w.get('[data-test="preview-login-guest"]').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith('/t/3')
    fetchMock.mockRejectedValueOnce(apiFailure(404, 'NOT_FOUND', { message: 'No active event' }))
    await w.get('[data-test="preview-login-guest"]').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('staff.previewLogin.failed:{"reason":"No active event"}')
  })
})
