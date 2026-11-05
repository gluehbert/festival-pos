import { computed, ref, type Ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { openSteps, SETUP_STEPS, stepDetail, stepDone, type SetupStepKey } from '~/utils/setup-steps'
import type { EventDto } from '~/../server/lib/contracts/admin'
import type { Setup } from '~/../server/lib/contracts/setup'

// The guided setup of an event. Ticks and facts come from the server
// (lib/event-setup.ts), so every admin device shows the same. Only hiding
// the guide bar is a per-device choice and stays in the browser.
const HIDDEN_KEY = (id: string) => `setup-hidden:${id}`
// Ticks earlier versions kept in the browser: sent to the server once.
const LEGACY_KEY = (id: string) => `setup-confirmed:${id}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }
  catch { /* not remembered, still works */ }
}

function legacyTicks(id: string): SetupStepKey[] {
  try {
    const v = JSON.parse(read(LEGACY_KEY(id)) ?? '[]')
    return Array.isArray(v) ? v.filter((k): k is SetupStepKey => SETUP_STEPS.some((s) => s.key === k)) : []
  }
  catch {
    return []
  }
}

const setupByEvent = ref<Record<string, Setup>>({})
const hiddenByEvent = ref<Record<string, boolean>>({})

export function useSetupGuide(event: Ref<EventDto>) {
  const api = useApi()
  const id = computed(() => event.value.id)
  const setup = computed(() => setupByEvent.value[id.value] ?? null)
  const done = (key: SetupStepKey) => stepDone(key, event.value, setup.value)
  const detail = (key: SetupStepKey) => stepDetail(key, event.value, setup.value)
  const open = computed(() => openSteps(event.value, setup.value))
  // The bar shows while an event is being prepared or rehearsed, unless hidden.
  const preparing = computed(() => !event.value.isActive ? !event.value.activatedAt : event.value.trialMode)
  const showBar = computed(() => preparing.value && !hiddenByEvent.value[id.value])

  const store = (eventId: string, s: Setup) => { setupByEvent.value = { ...setupByEvent.value, [eventId]: s } }

  async function send(eventId: string, steps: SetupStepKey[]): Promise<void> {
    store(eventId, await api.post<Setup>(`/api/admin/events/${eventId}/setup`, { steps }))
  }

  // Loads (or reloads, after a tab changed something) the ticks and facts.
  async function restore(): Promise<void> {
    const eventId = id.value
    hiddenByEvent.value = { ...hiddenByEvent.value, [eventId]: read(HIDDEN_KEY(eventId)) === '1' }
    try {
      const legacy = legacyTicks(eventId)
      if (legacy.length > 0) {
        await send(eventId, legacy)
        write(LEGACY_KEY(eventId), null)
      }
      else {
        store(eventId, await api.get<Setup>(`/api/admin/events/${eventId}/setup`))
      }
    }
    catch { /* the checklist stays unticked; setting up still works */ }
  }

  async function confirm(key: SetupStepKey): Promise<void> {
    if (setup.value?.confirmed.includes(key)) return
    try {
      await send(id.value, [key])
    }
    catch { /* not ticked; "Weiter" still moves on */ }
  }

  function setHidden(hidden: boolean): void {
    hiddenByEvent.value = { ...hiddenByEvent.value, [id.value]: hidden }
    write(HIDDEN_KEY(id.value), hidden ? '1' : null)
  }

  return { done, detail, open, preparing, showBar, restore, confirm, setHidden }
}

// Tests only: forget what was loaded.
export function resetSetupGuide(): void {
  setupByEvent.value = {}
  hiddenByEvent.value = {}
}
