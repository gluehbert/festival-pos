import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DisplayControls from '~/components/production/DisplayControls.vue'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('DisplayControls (kitchen/bar screen)', () => {
  it('plus and minus change the text size within bounds and remember it', async () => {
    let zoom = 1
    const w = mount(DisplayControls, {
      props: { 'modelValue': zoom, 'onUpdate:modelValue': (v: number) => { zoom = v; void w.setProps({ modelValue: v }) } },
    })
    await w.find('[data-test="zoom-in"]').trigger('click')
    expect(zoom).toBe(1.1)
    expect(w.find('[data-test="zoom-value"]').text()).toBe('110 %')
    expect(localStorage.getItem('production-zoom')).toBe('1.1')

    for (let i = 0; i < 10; i++) await w.find('[data-test="zoom-out"]').trigger('click')
    expect(zoom).toBe(0.7)
    expect(w.find('[data-test="zoom-out"]').attributes('disabled')).toBeDefined()
  })

  it('restores the stored size on mount', () => {
    localStorage.setItem('production-zoom', '1.3')
    const w = mount(DisplayControls, { props: { modelValue: 1 } })
    expect(w.emitted('update:modelValue')?.[0]).toEqual([1.3])
  })

  it('toggles fullscreen when the browser supports it', async () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    const request = vi.fn().mockResolvedValue(undefined)
    document.documentElement.requestFullscreen = request
    const w = mount(DisplayControls, { props: { modelValue: 1 } })
    await w.vm.$nextTick()
    await w.find('[data-test="fullscreen"]').trigger('click')
    expect(request).toHaveBeenCalled()

    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false })
    const hidden = mount(DisplayControls, { props: { modelValue: 1 } })
    await hidden.vm.$nextTick()
    expect(hidden.find('[data-test="fullscreen"]').exists()).toBe(false)
  })
})
