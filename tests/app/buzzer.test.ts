import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, ref } from 'vue'
import { BUZZER_COOLDOWN_MS, useBuzzer } from '~/composables/useBuzzer'
import BuzzerKeys from '~/components/admin/BuzzerKeys.vue'
import type { EventDto } from '~/../server/lib/contracts/admin'
import type { StationBuzzers } from '~/../server/lib/contracts/production'
import { useCookie } from './setup/imports'

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

describe('useBuzzer', () => {
  const onPress = vi.fn()
  const lanes = ref([{ lane: 1, key: 'F13' }])
  const Screen = defineComponent({
    setup() {
      useBuzzer(lanes, onPress)
      return () => h('div', [h('button', { 'data-test': 'other' }), h('input')])
    },
  })

  beforeEach(() => {
    onPress.mockReset()
    lanes.value = [{ lane: 1, key: 'F13' }]
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('fires on the configured key only, and not at all when no key is set', () => {
    const w = mount(Screen, { attachTo: document.body })
    press('Enter')
    expect(onPress).not.toHaveBeenCalled()
    press('F13')
    expect(onPress).toHaveBeenCalledWith(1)
    lanes.value = []
    vi.advanceTimersByTime(BUZZER_COOLDOWN_MS)
    press('F13')
    expect(onPress).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('counts a hard slap (double signal, held key) as one press', () => {
    const w = mount(Screen, { attachTo: document.body })
    press('F13')
    press('F13')
    press('F13', { repeat: true })
    expect(onPress).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(BUZZER_COOLDOWN_MS)
    press('F13')
    expect(onPress).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('tells the lanes apart, each with its own cooldown', () => {
    const w = mount(Screen, { attachTo: document.body })
    lanes.value = [{ lane: 1, key: 'F9' }, { lane: 2, key: 'F10' }, { lane: 3, key: 'F11' }]
    press('F9')
    press('F10')
    press('F9')
    press('F11')
    expect(onPress.mock.calls).toEqual([[1], [2], [3]])
    w.unmount()
  })

  it('wins over a focused button but leaves typing in a field alone', () => {
    const w = mount(Screen, { attachTo: document.body })
    lanes.value = [{ lane: 1, key: 'Enter' }]
    const click = vi.fn()
    const button = w.find('[data-test="other"]').element as HTMLButtonElement
    button.addEventListener('keydown', click)
    const onButton = press('Enter', {}, button)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onButton.defaultPrevented).toBe(true)
    expect(click).not.toHaveBeenCalled()

    vi.advanceTimersByTime(BUZZER_COOLDOWN_MS)
    const inField = press('Enter', {}, w.find('input').element)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(inField.defaultPrevented).toBe(false)
    w.unmount()
  })

  it('stops listening when the screen goes away', () => {
    const w = mount(Screen, { attachTo: document.body })
    w.unmount()
    press('F13')
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('BuzzerKeys (admin)', () => {
  const ID = '00000000-0000-4000-8000-000000000001'
  const event = {
    id: ID, name: 'Fest', pinCode: 'P1', isActive: true, tableRangeFrom: 1, tableRangeTo: 20,
    createdAt: '2026-05-01T10:00:00.000Z', activatedAt: null, deactivatedAt: null, startsOn: null, endsOn: null,
    trialMode: false, trialOrders: 0, depositEnabled: false, staffMealsEnabled: false, waiterCallsEnabled: false,
    foodPrepayEnabled: false, guestOpenLimitBarCents: 5000, guestOpenLimitKitchenCents: 8000,
  } satisfies EventDto
  const fetchMock = vi.fn()
  let stored: StationBuzzers

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    stored = { kitchen: [], bar: [], cafe: [] }
    fetchMock.mockImplementation(async (_url: string, o?: { method?: string; body?: { station: 'kitchen' | 'bar' | 'cafe'; keys: string[] } }) => {
      if (o?.method === 'PUT') stored = { ...stored, [o.body!.station]: o.body!.keys }
      return stored
    })
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  const puts = () => fetchMock.mock.calls.filter(([, o]) => (o as { method?: string })?.method === 'PUT').map(([, o]) => (o as { body: unknown }).body)
  const mountKeys = async () => {
    const w = mount(BuzzerKeys, { props: { event }, attachTo: document.body })
    await flushPromises()
    return w
  }

  it('adds buzzers per station from the next key pressed, skipping modifier keys, up to four', async () => {
    const w = await mountKeys()
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/events/${ID}/buzzers`)
    const kitchen = () => w.find('[data-test="buzzers-kitchen"]')
    await kitchen().find('[data-test="buzzer-add"]').trigger('click')
    expect(kitchen().find('[role="status"]').text()).toBe('admin.features.buzzer.listening')
    press('Shift')
    expect(puts()).toHaveLength(0)
    const e = press('F9')
    await flushPromises()
    expect(e.defaultPrevented).toBe(true)
    expect(puts()).toEqual([{ station: 'kitchen', keys: ['F9'] }])
    expect(w.emitted('saved')).toHaveLength(1)

    // Listening ended: later keys are not stored.
    press('a')
    await flushPromises()
    expect(puts()).toHaveLength(1)

    for (const key of ['F10', 'F11', 'F12']) {
      await kitchen().find('[data-test="buzzer-add"]').trigger('click')
      press(key)
      await flushPromises()
    }
    expect(kitchen().findAll('[data-test="buzzer-current"]').map((k) => k.text())).toEqual(['F9', 'F10', 'F11', 'F12'])
    expect(kitchen().find('[data-test="buzzer-add"]').exists()).toBe(false)
    expect(w.find('[data-test="buzzers-bar"] [data-test="buzzer-add"]').exists()).toBe(true)
    w.unmount()
  })

  it('refuses a key another buzzer of the station uses, but not one of the other station', async () => {
    stored = { kitchen: ['F9'], bar: [], cafe: [] }
    const w = await mountKeys()
    await w.find('[data-test="buzzers-kitchen"] [data-test="buzzer-add"]').trigger('click')
    press('F9')
    await flushPromises()
    expect(puts()).toHaveLength(0)
    expect(w.emitted('failed')).toEqual([['admin.features.buzzer.sameKey']])

    await w.find('[data-test="buzzers-bar"] [data-test="buzzer-add"]').trigger('click')
    press('F9')
    await flushPromises()
    expect(puts()).toEqual([{ station: 'bar', keys: ['F9'] }])
    w.unmount()
  })

  it('shows the current keys, changes one, can cancel and removes one', async () => {
    stored = { kitchen: [' ', 'F10'], bar: [], cafe: [] }
    const w = await mountKeys()
    const one = () => w.find('[data-test="buzzer-kitchen-1"]')
    expect(one().find('[data-test="buzzer-current"]').text()).toBe('admin.features.buzzer.space')
    await one().find('[data-test="buzzer-set"]').trigger('click')
    await one().find('[data-test="buzzer-cancel"]').trigger('click')
    press('x')
    await flushPromises()
    expect(puts()).toHaveLength(0)

    await one().find('[data-test="buzzer-set"]').trigger('click')
    press('F8')
    await flushPromises()
    expect(puts()).toEqual([{ station: 'kitchen', keys: ['F8', 'F10'] }])

    await one().find('[data-test="buzzer-clear"]').trigger('click')
    await flushPromises()
    expect(puts()[1]).toEqual({ station: 'kitchen', keys: ['F10'] })
    expect(w.findAll('[data-test="buzzers-kitchen"] [data-test="buzzer-current"]').map((k) => k.text())).toEqual(['F10'])
    w.unmount()
  })
})
