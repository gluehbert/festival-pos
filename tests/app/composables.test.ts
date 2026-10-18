import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFormat } from '~/composables/useFormat'
import { usePolling } from '~/composables/usePolling'
import { useApi } from '~/composables/useApi'
import { useElementHeight } from '~/composables/useElementHeight'
import { mount } from '@vue/test-utils'
import { defineComponent, h as h_, nextTick, ref } from 'vue'
import { locale, navigateTo, useCookie } from './setup/imports'

describe('useFormat', () => {
  it('formats money and names in the current language', () => {
    const f = useFormat()
    const item = { nameDe: 'Bier', nameEn: 'Beer' }
    expect(f.euro(1650)).toMatch(/€16\.50/)
    expect(f.itemName(item)).toBe('Beer')
    locale.value = 'de'
    // German literals on purpose: second locale (de-DE money format, German item name).
    expect(f.euro(1650)).toMatch(/16,50\s€/)
    expect(f.itemName(item)).toBe('Bier')
    expect(f.dateTime(null)).toBe('–')
  })
})

describe('usePolling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fetches on start, on the interval and on refresh; backs off on errors; stops', async () => {
    const fn = vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('down')).mockResolvedValue(3)
    const p = usePolling(fn, { intervalMs: 1000 })
    p.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(p.data.value).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(p.error.value).toBeInstanceOf(Error)
    // After one error the next try waits 2 x interval.
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(p.data.value).toBe(3)
    expect(p.error.value).toBeNull()

    p.refresh()
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(4)

    p.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fn).toHaveBeenCalledTimes(4)
  })
})

describe('useApi', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    window.history.replaceState({}, '', '/')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends same-origin requests and a CSRF header on mutations', async () => {
    useCookie<string>('csrf').value = 'c'.repeat(64)
    fetchMock.mockResolvedValue({ ok: true })
    await useApi().post('/api/orders', { a: 1 })
    const [path, opts] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/orders')
    expect(opts.baseURL).toBeUndefined()
    expect(opts.headers['x-csrf-token']).toBe('c'.repeat(64))
    expect(opts.method).toBe('POST')
  })

  it('fetches a CSRF token when none is stored', async () => {
    fetchMock.mockImplementation(async (path: string) => (path === '/api/csrf-token' ? { csrfToken: 't'.repeat(64) } : {}))
    await useApi().patch('/api/x', {})
    expect(fetchMock.mock.calls[1]![1].headers['x-csrf-token']).toBe('t'.repeat(64))
  })

  it('redirects 401s to the staff login only on staff pages', async () => {
    fetchMock.mockRejectedValue({ statusCode: 401 })
    window.history.replaceState({}, '', '/t/3')
    await expect(useApi().get('/api/session/me')).rejects.toBeTruthy()
    expect(navigateTo).not.toHaveBeenCalled()

    window.history.replaceState({}, '', '/staff/join/abc')
    await expect(useApi().get('/api/auth/me')).rejects.toBeTruthy()
    expect(navigateTo).not.toHaveBeenCalled()

    window.history.replaceState({}, '', '/staff/3')
    await expect(useApi().get('/api/tickets')).rejects.toBeTruthy()
    expect(navigateTo).toHaveBeenCalledWith('/staff/login')
  })

  it('retries 503 responses with backoff', async () => {
    vi.useFakeTimers()
    try {
      fetchMock
        .mockRejectedValueOnce({ statusCode: 503, response: { headers: new Headers({ 'retry-after': '0' }) } })
        .mockResolvedValueOnce('ok')
      const pending = useApi().get('/api/menu')
      await vi.advanceTimersByTimeAsync(2000)
      await expect(pending).resolves.toBe('ok')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('useElementHeight', () => {
  it('follows the element height as it grows and stops observing on unmount', async () => {
    let notify = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { notify = cb }
      observe() {}
      disconnect = disconnect
    })
    let h = 120
    const Bar = defineComponent({
      setup() {
        const el = ref<HTMLElement | null>(null)
        const height = useElementHeight(el)
        return () => h_('aside', { ref: el, 'data-h': height.value })
      },
    })
    const w = mount(Bar)
    const aside = w.find('aside').element as HTMLElement
    Object.defineProperty(aside, 'offsetHeight', { get: () => h })
    notify()
    await nextTick()
    expect(w.find('aside').attributes('data-h')).toBe('120')
    h = 400
    notify()
    await nextTick()
    expect(w.find('aside').attributes('data-h')).toBe('400')
    w.unmount()
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
