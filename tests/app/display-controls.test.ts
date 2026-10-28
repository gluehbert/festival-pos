import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DisplayControls from '~/components/production/DisplayControls.vue'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

const pageZoom = () => document.documentElement.style.zoom

describe('DisplayControls (kitchen/bar screen)', () => {
  it('plus and minus zoom the whole page within bounds and remember it', async () => {
    const w = mount(DisplayControls)
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
    const w = mount(DisplayControls)
    expect(pageZoom()).toBe('1.3')
    w.unmount()
  })

  it('toggles fullscreen when the browser supports it', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    const request = vi.fn().mockResolvedValue(undefined)
    document.documentElement.requestFullscreen = request
    const w = mount(DisplayControls)
    await w.vm.$nextTick()
    await w.find('[data-test="fullscreen"]').trigger('click')
    expect(request).toHaveBeenCalled()

    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
    const hidden = mount(DisplayControls)
    await hidden.vm.$nextTick()
    expect(hidden.find('[data-test="fullscreen"]').exists()).toBe(false)
  })
})
