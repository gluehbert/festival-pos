import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, ref } from 'vue'
import { BUZZER_COOLDOWN_MS, useBuzzer } from '~/composables/useBuzzer'
import EventFeaturesPanel from '~/components/admin/EventFeaturesPanel.vue'
import type { EventDto } from '~/../server/lib/contracts/admin'
import { useCookie } from './setup/imports'

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

describe('useBuzzer', () => {
  const onPress = vi.fn()
  const key = ref<string | null>('F13')
  const Screen = defineComponent({
    setup() {
      useBuzzer(key, onPress)
      return () => h('div', [h('button', { 'data-test': 'other' }), h('input')])
    },
  })

  beforeEach(() => {
    onPress.mockReset()
    key.value = 'F13'
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('fires on the configured key only, and not at all when no key is set', () => {
    const w = mount(Screen, { attachTo: document.body })
    press('Enter')
    expect(onPress).not.toHaveBeenCalled()
    press('F13')
    expect(onPress).toHaveBeenCalledTimes(1)
    key.value = null
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

  it('wins over a focused button but leaves typing in a field alone', () => {
    const w = mount(Screen, { attachTo: document.body })
    key.value = 'Enter'
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

describe('EventFeaturesPanel — buzzer key', () => {
  const ID = '00000000-0000-4000-8000-000000000001'
  const ev = (buzzerKey: string | null) => ({
    id: ID, name: 'Fest', pinCode: 'P1', isActive: true, tableRangeFrom: 1, tableRangeTo: 20,
    createdAt: '2026-05-01T10:00:00.000Z', activatedAt: null, deactivatedAt: null, startsOn: null, endsOn: null,
    trialMode: false, trialOrders: 0, depositEnabled: false, staffMealsEnabled: false, waiterCallsEnabled: false,
    buzzerKey, guestOpenLimitBarCents: 5000, guestOpenLimitKitchenCents: 8000,
  }) satisfies EventDto
  const fetchMock = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({})
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  const patches = () => fetchMock.mock.calls.filter(([, o]) => (o as { method?: string })?.method === 'PATCH')

  it('stores the next key pressed, skipping modifier keys', async () => {
    const w = mount(EventFeaturesPanel, { props: { event: ev(null) }, attachTo: document.body })
    expect(w.find('[data-test="buzzer-current"]').exists()).toBe(false)
    await w.find('[data-test="buzzer-set"]').trigger('click')
    expect(w.find('[role="status"]').text()).toBe('admin.features.buzzerKey.listening')

    press('Shift')
    expect(patches()).toHaveLength(0)
    const e = press('F13')
    await flushPromises()
    expect(e.defaultPrevented).toBe(true)
    expect(patches()).toHaveLength(1)
    expect(patches()[0]).toMatchObject([`/api/admin/events/${ID}/branding`, { body: { buzzerKey: 'F13' } }])
    expect(w.emitted('saved')).toHaveLength(1)

    // Listening ended: later keys are not stored.
    press('a')
    await flushPromises()
    expect(patches()).toHaveLength(1)
    w.unmount()
  })

  it('shows the current key, can cancel a change and remove the key', async () => {
    const w = mount(EventFeaturesPanel, { props: { event: ev(' ') }, attachTo: document.body })
    expect(w.find('[data-test="buzzer-current"]').text()).toBe('admin.features.buzzerKey.space')
    await w.find('[data-test="buzzer-set"]').trigger('click')
    await w.find('[data-test="buzzer-cancel"]').trigger('click')
    press('x')
    await flushPromises()
    expect(patches()).toHaveLength(0)

    await w.find('[data-test="buzzer-clear"]').trigger('click')
    await flushPromises()
    expect(patches()[0]).toMatchObject([`/api/admin/events/${ID}/branding`, { body: { buzzerKey: null } }])
    w.unmount()
  })
})
