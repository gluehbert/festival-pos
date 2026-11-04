import { computed, ref, type Ref } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { openSteps, SETUP_STEPS, stepDone, type SetupStepKey } from '~/utils/setup-steps'
import type { EventDto } from '~/../server/lib/contracts/admin'

// Per event and device: which guide steps the admin went past with "Weiter",
// and whether the guide bar is hidden. Nothing here is needed to run the
// festival, so the browser keeps it; another device simply starts unticked.
const CONFIRMED_KEY = (id: string) => `setup-confirmed:${id}`
const HIDDEN_KEY = (id: string) => `setup-hidden:${id}`

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

const confirmedByEvent = ref<Record<string, SetupStepKey[]>>({})
const hiddenByEvent = ref<Record<string, boolean>>({})

function load(id: string): void {
  if (id in confirmedByEvent.value) return
  let list: SetupStepKey[] = []
  try {
    const v = JSON.parse(read(CONFIRMED_KEY(id)) ?? '[]')
    if (Array.isArray(v)) list = v.filter((k) => SETUP_STEPS.some((s) => s.key === k))
  }
  catch { /* broken data: start unticked */ }
  confirmedByEvent.value = { ...confirmedByEvent.value, [id]: list }
  hiddenByEvent.value = { ...hiddenByEvent.value, [id]: read(HIDDEN_KEY(id)) === '1' }
}

export function useSetupGuide(event: Ref<EventDto>) {
  const admin = useAdminStore()
  const id = computed(() => event.value.id)
  const confirmed = computed(() => new Set(confirmedByEvent.value[id.value] ?? []))
  const menuCount = computed(() => (admin.menuEventId === id.value ? admin.menuItems.length : null))
  const facts = computed(() => ({ menuCount: menuCount.value, confirmed: confirmed.value }))
  const done = (key: SetupStepKey) => stepDone(key, event.value, facts.value)
  const open = computed(() => openSteps(event.value, facts.value))
  // The bar shows while an event is being prepared or rehearsed, unless hidden.
  const preparing = computed(() => !event.value.isActive ? !event.value.activatedAt : event.value.trialMode)
  const showBar = computed(() => preparing.value && !hiddenByEvent.value[id.value])

  function restore(): void {
    load(id.value)
    if (admin.menuEventId !== id.value) void admin.fetchMenuItems(id.value).catch(() => {})
  }

  function confirm(key: SetupStepKey): void {
    if (confirmed.value.has(key)) return
    const list = [...confirmed.value, key]
    confirmedByEvent.value = { ...confirmedByEvent.value, [id.value]: list }
    write(CONFIRMED_KEY(id.value), JSON.stringify(list))
  }

  function setHidden(hidden: boolean): void {
    hiddenByEvent.value = { ...hiddenByEvent.value, [id.value]: hidden }
    write(HIDDEN_KEY(id.value), hidden ? '1' : null)
  }

  return { done, open, menuCount, preparing, showBar, restore, confirm, setHidden }
}

// Tests only: forget what was loaded.
export function resetSetupGuide(): void {
  confirmedByEvent.value = {}
  hiddenByEvent.value = {}
}
