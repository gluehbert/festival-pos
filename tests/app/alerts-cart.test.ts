import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { resetAttention, useAttention } from '~/composables/useAttention'
import AlertToggles from '~/components/common/AlertToggles.vue'
import { useCartStore } from '~/stores/cart'
import { createPinia, setActivePinia } from 'pinia'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

// Minimal Web Audio stand-in: counts the tones played.
const oscillators: { freq: number }[] = []
class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 0
  destination = {}
  async resume() {
    this.state = 'running'
  }

  createOscillator() {
    const osc = { type: '', frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() }
    oscillators.push({ get freq() { return osc.frequency.value } })
    return osc
  }

  createGain() {
    const g = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n }
    return g
  }
}

const vibrate = vi.fn()

beforeEach(() => {
  resetAttention()
  oscillators.length = 0
  vibrate.mockReset()
  localStorage.clear()
  vi.stubGlobal('AudioContext', FakeAudioContext)
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useAttention', () => {
  it('stays silent until the first tap, but vibrates', async () => {
    const a = useAttention()
    a.init()
    a.notify()
    expect(oscillators).toHaveLength(0)
    expect(vibrate).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(a.unlocked.value).toBe(true))
    a.notify()
    expect(oscillators.map((o) => o.freq)).toEqual([880, 1320])
    expect(vibrate).toHaveBeenCalledTimes(2)
  })

  it('remembers "off" per device and keeps quiet then', async () => {
    const a = useAttention()
    a.init()
    await a.toggle() // locked -> unlock + test tone
    expect(a.unlocked.value).toBe(true)
    expect(oscillators).toHaveLength(2)
    await a.toggle()
    expect(a.enabled.value).toBe(false)
    expect(localStorage.getItem('alert-sound')).toBe('off')
    a.notify()
    expect(oscillators).toHaveLength(2)

    resetAttention()
    useAttention().init()
    expect(useAttention().enabled.value).toBe(false)
  })

  it('switches vibration separately and remembers it', () => {
    const a = useAttention()
    a.init()
    expect(a.vibrationSupported.value).toBe(true)
    a.toggleVibration()
    expect(a.vibrationEnabled.value).toBe(false)
    expect(localStorage.getItem('alert-vibration')).toBe('off')
    a.notify()
    expect(vibrate).not.toHaveBeenCalled()

    // Switching it back on buzzes once as a test.
    a.toggleVibration()
    expect(vibrate).toHaveBeenCalledTimes(1)

    localStorage.setItem('alert-vibration', 'off')
    resetAttention()
    useAttention().init()
    expect(useAttention().vibrationEnabled.value).toBe(false)
    // Sound is unaffected.
    expect(useAttention().enabled.value).toBe(true)
  })

  it('works without storage or audio support', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    vi.stubGlobal('AudioContext', undefined)
    const a = useAttention()
    a.init()
    expect(a.enabled.value).toBe(true)
    await a.toggle()
    expect(a.unlocked.value).toBe(false)
    expect(() => a.notify()).not.toThrow()
  })
})

describe('AlertToggles', () => {
  it('sound: shows "enable", then "on", then "off"', async () => {
    const w = mount(AlertToggles)
    const btn = w.find('[data-test="sound-toggle"]')
    expect(btn.text()).toContain('alerts.sound.locked')
    await btn.trigger('click')
    await vi.waitFor(() => expect(btn.text()).toContain('alerts.sound.on'))
    expect(btn.attributes('aria-pressed')).toBe('true')
    await btn.trigger('click')
    expect(btn.text()).toContain('alerts.sound.off')
    expect(btn.attributes('aria-pressed')).toBe('false')
  })

  it('vibration: toggles on and off', async () => {
    const w = mount(AlertToggles)
    await w.vm.$nextTick()
    const btn = w.find('[data-test="vibration-toggle"]')
    expect(btn.text()).toContain('alerts.vibration.on')
    await btn.trigger('click')
    expect(btn.text()).toContain('alerts.vibration.off')
    expect(btn.attributes('aria-pressed')).toBe('false')
  })

  it('vibration: hidden on devices that cannot vibrate', async () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    const w = mount(AlertToggles)
    await w.vm.$nextTick()
    expect(w.find('[data-test="vibration-toggle"]').exists()).toBe(false)
    expect(w.find('[data-test="sound-toggle"]').exists()).toBe(true)
  })
})

describe('guest cart survives a reload', () => {
  const fries = { id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto
  const beer = { ...fries, id: 'b', nameDe: 'Bier', priceCents: 450, station: 'bar' } as MenuItemDto

  function reload() {
    setActivePinia(createPinia())
    return useCartStore()
  }

  it('keeps the cart per table and restores it', () => {
    const cart = useCartStore()
    cart.setTable(3)
    cart.add(fries)
    cart.add(fries)
    cart.add(beer)
    cart.setQty('b', 4)

    const after = reload()
    after.setTable(3)
    after.restore()
    expect(after.lines.map((l) => [l.menuItem.id, l.quantity])).toEqual([['f', 2], ['b', 4]])

    const other = reload()
    other.setTable(4)
    other.restore()
    expect(other.isEmpty).toBe(true)
  })

  it('forgets the cart once it is ordered or emptied', () => {
    const cart = useCartStore()
    cart.setTable(3)
    cart.add(fries)
    cart.clear()
    expect(localStorage.getItem('guest-cart:3')).toBeNull()
    cart.add(fries)
    cart.remove('f')
    expect(localStorage.getItem('guest-cart:3')).toBeNull()
  })

  it('ignores broken data and updates restored lines from the menu', () => {
    localStorage.setItem('guest-cart:5', '{nope')
    const cart = useCartStore()
    cart.setTable(5)
    cart.restore()
    expect(cart.isEmpty).toBe(true)

    localStorage.setItem('guest-cart:6', JSON.stringify([
      { menuItem: fries, quantity: 2 },
      { menuItem: beer, quantity: 1 },
      { menuItem: { id: 'gone' }, quantity: 1 },
      { menuItem: fries, quantity: 999 },
    ]))
    cart.setTable(6)
    cart.restore()
    expect(cart.lines).toHaveLength(3)
    cart.syncWithMenu([{ ...fries, priceCents: 400 }, { ...beer, isAvailable: false }])
    expect(cart.lines.map((l) => [l.menuItem.id, l.menuItem.priceCents, l.quantity])).toEqual([['f', 400, 2]])
    expect(JSON.parse(localStorage.getItem('guest-cart:6')!)).toHaveLength(1)
  })

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const cart = useCartStore()
    cart.setTable(3)
    cart.add(fries)
    cart.restore()
    expect(cart.itemCount).toBe(1)
  })
})
