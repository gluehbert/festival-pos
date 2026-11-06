import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { resetAttention, useAttention } from '~/composables/useAttention'
import AlertToggles from '~/components/common/AlertToggles.vue'
import SoundLockedBanner from '~/components/common/SoundLockedBanner.vue'
import AlertFlash from '~/components/common/AlertFlash.vue'
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
  it('stays silent until the first tap, but vibrates and flashes', async () => {
    const a = useAttention()
    a.init()
    a.notify()
    expect(oscillators).toHaveLength(0)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(a.flashing.value).toBe(true)

    window.dispatchEvent(new Event('click'))
    await vi.waitFor(() => expect(a.unlocked.value).toBe(true))
    a.notify()
    expect(oscillators.map((o) => o.freq)).toEqual([880, 1320])
    expect(vibrate).toHaveBeenCalledTimes(2)
  })

  it('vibrate mode: no tone, still buzzes and flashes; remembered per device', async () => {
    const a = useAttention()
    a.init()
    await a.setMode('vibrate')
    expect(localStorage.getItem('alert-mode')).toBe('vibrate')
    window.dispatchEvent(new Event('click'))
    await new Promise((r) => setTimeout(r, 0))
    const flashes = a.flashKey.value
    a.notify()
    expect(oscillators).toHaveLength(0)
    expect(vibrate).toHaveBeenCalledTimes(2) // test buzz + alert
    expect(a.flashKey.value).toBe(flashes + 1)

    resetAttention()
    useAttention().init()
    expect(useAttention().mode.value).toBe('vibrate')
  })

  it('a caller that lights up its own spot skips the screen flash', () => {
    const a = useAttention()
    a.init()
    const flashes = a.flashKey.value
    a.notify({ flash: false })
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(a.flashKey.value).toBe(flashes)
  })

  it('silent mode: only the screen flash', async () => {
    const a = useAttention()
    a.init()
    await a.setMode('silent')
    a.notify()
    expect(oscillators).toHaveLength(0)
    expect(vibrate).not.toHaveBeenCalled()
    expect(a.flashing.value).toBe(true)
  })

  it('loud mode: picking it unlocks the tone and plays it as a test', async () => {
    const a = useAttention()
    a.init()
    await a.setMode('loud')
    expect(a.unlocked.value).toBe(true)
    expect(oscillators).toHaveLength(2)
  })

  it('takes over the old sound / vibration switches', () => {
    localStorage.setItem('alert-sound', 'off')
    useAttention().init()
    expect(useAttention().mode.value).toBe('vibrate')

    localStorage.setItem('alert-vibration', 'off')
    resetAttention()
    useAttention().init()
    expect(useAttention().mode.value).toBe('silent')
  })

  it('the flash ends by itself', () => {
    vi.useFakeTimers()
    const a = useAttention()
    a.init()
    a.notify()
    expect(a.flashing.value).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(a.flashing.value).toBe(false)
    vi.useRealTimers()
  })

  it('works without storage or audio support', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    vi.stubGlobal('AudioContext', undefined)
    const a = useAttention()
    a.init()
    expect(a.mode.value).toBe('loud')
    await a.setMode('loud')
    expect(a.unlocked.value).toBe(false)
    expect(() => a.notify()).not.toThrow()
  })
})

describe('AlertToggles', () => {
  it('offers the three modes and marks the current one', async () => {
    const w = mount(AlertToggles)
    await w.vm.$nextTick()
    expect(w.findAll('[role="radio"]').map((b) => b.attributes('data-mode'))).toEqual(['loud', 'vibrate', 'silent'])
    expect(w.get('[data-mode="loud"]').attributes('aria-checked')).toBe('true')
    await w.get('[data-mode="silent"]').trigger('click')
    expect(w.get('[data-mode="silent"]').attributes('aria-checked')).toBe('true')
    expect(useAttention().mode.value).toBe('silent')
  })

  it('says so when vibration only cannot vibrate', async () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    const w = mount(AlertToggles)
    await w.vm.$nextTick()
    expect(w.find('[data-test="no-vibration"]').exists()).toBe(false)
    await w.get('[data-mode="vibrate"]').trigger('click')
    expect(w.find('[data-test="no-vibration"]').exists()).toBe(true)
  })
})

describe('SoundLockedBanner and AlertFlash', () => {
  const stubs = { ClientOnly: { template: '<div><slot /></div>' } }

  it('the banner shows until the first tap unlocks the tone, and not when silent', async () => {
    const w = mount(SoundLockedBanner, { global: { stubs }, attachTo: document.body })
    await w.vm.$nextTick()
    expect(w.find('[data-test="sound-locked"]').exists()).toBe(true)
    await w.get('[data-test="sound-locked"]').trigger('click')
    await vi.waitFor(() => expect(w.find('[data-test="sound-locked"]').exists()).toBe(false))
    w.unmount()

    resetAttention()
    localStorage.setItem('alert-mode', 'silent')
    const quiet = mount(SoundLockedBanner, { global: { stubs } })
    await quiet.vm.$nextTick()
    expect(quiet.find('[data-test="sound-locked"]').exists()).toBe(false)
  })

  it('the flash appears on an alert', async () => {
    const w = mount(AlertFlash)
    expect(w.find('[data-test="alert-flash"]').exists()).toBe(false)
    useAttention().notify()
    await w.vm.$nextTick()
    expect(w.find('[data-test="alert-flash"]').exists()).toBe(true)
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
