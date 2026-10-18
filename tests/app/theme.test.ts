import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useTheme } from '~/composables/useTheme'
import { useAuthStore } from '~/stores/auth'
import ThemeSwitcher from '~/components/common/ThemeSwitcher.vue'
import { useCookie } from './setup/imports'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'x'.repeat(64)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const session = (theme: string) => ({ staffId: 's', username: 'alice', role: 'waiter', theme })

describe('useTheme', () => {
  it('follows the OS by default and ignores tampered cookie values', () => {
    expect(useTheme().theme.value).toBe('system')
    useCookie<string>('pos_theme').value = 'sepia'
    expect(useTheme().theme.value).toBe('system')
  })

  it('keeps a guest choice on the device without calling the API', async () => {
    await useTheme().choose('dark', false)
    expect(useCookie('pos_theme').value).toBe('dark')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('saves a signed-in choice to the account and reverts when that fails', async () => {
    fetchMock.mockResolvedValueOnce({ theme: 'light' })
    await useTheme().choose('light', true)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/theme', expect.objectContaining({ method: 'PUT', body: { theme: 'light' } }))
    expect(useCookie('pos_theme').value).toBe('light')

    fetchMock.mockRejectedValueOnce({ statusCode: 500 })
    await useTheme().choose('dark', true)
    expect(useCookie('pos_theme').value).toBe('light')
  })
})

describe('auth store and colour scheme', () => {
  it('applies the account theme on login and /me, and resets it on logout', async () => {
    const auth = useAuthStore()
    fetchMock.mockResolvedValueOnce(session('dark'))
    await auth.login({ username: 'alice', secret: 'secret123', kind: 'password' })
    expect(useCookie('pos_theme').value).toBe('dark')

    fetchMock.mockResolvedValueOnce(session('light'))
    await auth.refresh()
    expect(useCookie('pos_theme').value).toBe('light')

    fetchMock.mockResolvedValueOnce({ ok: true })
    await auth.logout()
    expect(useCookie('pos_theme').value).toBe('system')
  })
})

describe('auth store session check', () => {
  it('keeps the session when /me fails for another reason than 401', async () => {
    const auth = useAuthStore()
    fetchMock.mockResolvedValueOnce(session('system'))
    await auth.refresh()
    fetchMock.mockRejectedValueOnce({ statusCode: 500 })
    await expect(auth.refresh()).resolves.toMatchObject({ username: 'alice' })
    expect(auth.isAuthenticated).toBe(true)
    fetchMock.mockRejectedValueOnce({ statusCode: 401 })
    await expect(auth.refresh()).resolves.toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})

describe('ThemeSwitcher', () => {
  it('marks the active option and saves a new pick for signed-in staff', async () => {
    const auth = useAuthStore()
    auth.staff = session('system') as never
    const w = mount(ThemeSwitcher)
    expect(w.get('[data-theme-option="system"]').attributes('aria-checked')).toBe('true')

    fetchMock.mockResolvedValueOnce({ theme: 'dark' })
    await w.get('[data-theme-option="dark"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-theme-option="dark"]').attributes('aria-checked')).toBe('true')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/theme', expect.objectContaining({ body: { theme: 'dark' } }))
  })
})
