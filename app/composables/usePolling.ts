import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export interface PollingOptions {
  intervalMs: number
  immediate?: boolean
  maxBackoffMs?: number
}

export interface PollingHandle<T> {
  data: Ref<T | null>
  error: Ref<unknown>
  pending: Ref<boolean>
  start: () => void
  stop: () => void
  /** Fetch now (if started) instead of waiting for the next interval. */
  refresh: () => void
}

export function usePolling<T>(fn: () => Promise<T>, opts: PollingOptions): PollingHandle<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<unknown>(null)
  const pending = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let errorCount = 0
  let active = false

  const maxBackoff = opts.maxBackoffMs ?? 60_000

  function isVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible'
  }

  async function tick() {
    if (!active) return
    if (!isVisible()) {
      schedule(opts.intervalMs)
      return
    }
    pending.value = true
    try {
      data.value = await fn()
      error.value = null
      errorCount = 0
      schedule(opts.intervalMs)
    }
    catch (err) {
      error.value = err
      errorCount++
      const backoff = Math.min(opts.intervalMs * 2 ** errorCount, maxBackoff)
      schedule(backoff)
    }
    finally {
      pending.value = false
    }
  }

  function schedule(ms: number) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(tick, ms)
  }

  function start() {
    if (active) return
    active = true
    if (opts.immediate ?? true) {
      void tick()
    }
    else {
      schedule(opts.intervalMs)
    }
  }

  function stop() {
    active = false
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function refresh() {
    if (active) void tick()
  }

  function onVisibility() {
    if (active && isVisible()) {
      void tick()
    }
  }

  // Back online: try now instead of waiting out the backoff.
  function onOnline() {
    if (active) void tick()
  }

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('online', onOnline)
    }
    start()
  })

  onBeforeUnmount(() => {
    stop()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  })

  return { data, error, pending, start, stop, refresh }
}
