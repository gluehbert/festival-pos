import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DisplayMenu from '~/components/production/DisplayMenu.vue'

const stubs = { UPopover: { template: '<div><slot /><slot name="content" /></div>' } }
const mountMenu = () => mount(DisplayMenu, { global: { stubs } })

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'wakeLock')
})

const pageZoom = () => document.documentElement.style.zoom

function fakeWakeLock() {
  const release = vi.fn().mockResolvedValue(undefined)
  const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() })
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
  return { request, release }
}

describe('DisplayMenu (kitchen/bar header)', () => {
  it('plus and minus zoom the whole page within bounds and remember it', async () => {
    const w = mountMenu()
    await w.find('[data-test="zoom-in"]').trigger('click')
    expect(pageZoom()).toBe('1.1')
    expect(w.find('[data-test="zoom-value"]').text()).toBe('110 %')
    expect(localStorage.getItem('production-zoom')).toBe('1.1')

    for (let i = 0; i < 10; i++) await w.find('[data-test="zoom-out"]').trigger('click')
    expect(pageZoom()).toBe('0.7')
    expect(w.find('[data-test="zoom-out"]').attributes('disabled')).toBeDefined()

    // Leaving the screen gives other pages their normal size back.
    w.unmount()
    expect(pageZoom()).toBe('')
  })

  it('restores the stored zoom on mount', () => {
    localStorage.setItem('production-zoom', '1.3')
    const w = mountMenu()
    expect(pageZoom()).toBe('1.3')
    w.unmount()
  })

  it('toggles fullscreen when the browser supports it', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    const request = vi.fn().mockResolvedValue(undefined)
    document.documentElement.requestFullscreen = request
    const w = mountMenu()
    await w.vm.$nextTick()
    await w.find('[data-test="fullscreen"]').trigger('click')
    expect(request).toHaveBeenCalled()

    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
    const hidden = mountMenu()
    await hidden.vm.$nextTick()
    expect(hidden.find('[data-test="fullscreen"]').exists()).toBe(false)
  })

  it('keeps the screen on by default, can be switched off and remembers it', async () => {
    const { request, release } = fakeWakeLock()
    const w = mountMenu()
    await flushPromises()
    expect(request).toHaveBeenCalledWith('screen')

    await w.find('[data-test="keep-awake"]').trigger('click')
    expect(release).toHaveBeenCalled()
    expect(localStorage.getItem('production-keep-awake')).toBe('off')
    w.unmount()

    request.mockClear()
    mountMenu()
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
  })

  it('releases the lock when leaving the screen and hides the switch without support', async () => {
    const { release } = fakeWakeLock()
    const w = mountMenu()
    await flushPromises()
    w.unmount()
    expect(release).toHaveBeenCalled()

    Reflect.deleteProperty(navigator, 'wakeLock')
    const unsupported = mountMenu()
    await unsupported.vm.$nextTick()
    expect(unsupported.find('[data-test="keep-awake"]').exists()).toBe(false)
  })
})
