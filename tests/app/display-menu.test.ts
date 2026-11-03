import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DisplayMenu from '~/components/production/DisplayMenu.vue'

const mountMenu = () => mount(DisplayMenu, { attachTo: document.body })
async function openMenu(w: ReturnType<typeof mountMenu>) {
  await w.find('[data-test="display-menu"]').trigger('click')
}

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
    await openMenu(w)
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

  it('opens as a dropdown in the header and closes on an outside tap or Escape', async () => {
    const w = mountMenu()
    expect(w.find('[data-test="display-panel"]').exists()).toBe(false)
    await openMenu(w)
    expect(w.find('[data-test="display-panel"]').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.find('[data-test="display-panel"]').exists()).toBe(false)

    await openMenu(w)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await w.vm.$nextTick()
    expect(w.find('[data-test="display-panel"]').exists()).toBe(false)
    w.unmount()
  })

  it('toggles fullscreen when the browser supports it', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    const request = vi.fn().mockResolvedValue(undefined)
    document.documentElement.requestFullscreen = request
    const w = mountMenu()
    await openMenu(w)
    await w.find('[data-test="fullscreen"]').trigger('click')
    expect(request).toHaveBeenCalled()

    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
    const hidden = mountMenu()
    await openMenu(hidden)
    expect(hidden.find('[data-test="fullscreen"]').exists()).toBe(false)
  })

  it('keeps the screen on by default, can be switched off and remembers it', async () => {
    const { request, release } = fakeWakeLock()
    const w = mountMenu()
    await flushPromises()
    expect(request).toHaveBeenCalledWith('screen')

    await openMenu(w)
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
    await openMenu(unsupported)
    expect(unsupported.find('[data-test="keep-awake"]').exists()).toBe(false)
  })
})
