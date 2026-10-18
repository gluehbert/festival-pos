import { ref } from 'vue'

// State of one keyed send with automatic retries: which retry runs, and a
// way to stop further attempts. The idempotency key is owned by the caller
// and survives a cancel.
export function useSendState() {
  const sending = ref<{ attempt: number, max: number } | null>(null)
  let ctrl: AbortController | null = null

  // Options for useApi: signal and attempt callback.
  function begin() {
    ctrl = new AbortController()
    sending.value = { attempt: 0, max: 0 }
    return {
      signal: ctrl.signal,
      onAttempt: (attempt: number, max: number) => { sending.value = { attempt, max } },
    }
  }

  function end(): void {
    ctrl = null
    sending.value = null
  }

  function cancel(): void {
    ctrl?.abort()
  }

  return { sending, begin, end, cancel }
}
