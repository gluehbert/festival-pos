import { onBeforeUnmount, onMounted, type Ref } from 'vue'

// A hard slap can make a cheap buzzer send its key twice: one hit, one card.
export const BUZZER_COOLDOWN_MS = 1000

// A buzzer at the kitchen/bar acts as a one-key keyboard. Its key (set per
// event, null = off) calls `onPress`. It wins over a focused button, so the
// buzzer never "clicks" whatever was tapped last; typing in a field is left
// alone.
export function useBuzzer(key: Readonly<Ref<string | null>>, onPress: () => void): void {
  let lastAt = -Infinity

  function onKeydown(e: KeyboardEvent) {
    if (!key.value || e.key !== key.value) return
    const el = e.target as HTMLElement | null
    if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat || Date.now() - lastAt < BUZZER_COOLDOWN_MS) return
    lastAt = Date.now()
    onPress()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
}
