import { onBeforeUnmount, onMounted, type Ref } from 'vue'

// A hard slap can make a cheap buzzer send its key twice: one hit, one card.
export const BUZZER_COOLDOWN_MS = 1000

// Buzzers at the kitchen/bar act as one-key keyboards. The key of a lane
// (set per station by the admin) calls `onPress` with that lane. It wins over
// a focused button, so a buzzer never "clicks" whatever was tapped last;
// typing in a field is left alone. Each buzzer has its own cooldown.
export function useBuzzer(lanes: Readonly<Ref<ReadonlyArray<{ lane: number; key: string }>>>, onPress: (lane: number) => void): void {
  const lastAt = new Map<number, number>()

  function onKeydown(e: KeyboardEvent) {
    const lane = lanes.value.find((l) => l.key === e.key)?.lane
    if (lane === undefined) return
    const el = e.target as HTMLElement | null
    if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat || Date.now() - (lastAt.get(lane) ?? -Infinity) < BUZZER_COOLDOWN_MS) return
    lastAt.set(lane, Date.now())
    onPress(lane)
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
}
