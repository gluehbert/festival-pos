import { readonly, ref } from 'vue'

// Alerts when something needs staff attention (new orders at the kitchen /
// bar, finished items for the service). Shared by all screens: one
// AudioContext and one mode per device, as on a phone:
//   loud    – tone + vibration
//   vibrate – vibration only (a counter next to a stage programme)
//   silent  – nothing but the screen flash
// Every alert also flashes the screen, so a muted counter still notices.
//
// Browsers block audio until the user interacted with the page, so the
// context is created / resumed on the first tap or key press. The tone is
// synthesised (Web Audio), no asset file needed.

export type AlertMode = 'loud' | 'vibrate' | 'silent'
export const ALERT_MODES: readonly AlertMode[] = ['loud', 'vibrate', 'silent']

const MODE_KEY = 'alert-mode'
// Before the modes there were two switches; their values still count.
const OLD_SOUND_KEY = 'alert-sound'
const OLD_VIBRATION_KEY = 'alert-vibration'
// How long the screen flash runs (see AlertFlash.vue).
const FLASH_MS = 1800

const mode = ref<AlertMode>('loud')
const unlocked = ref(false)
// Only known on the client (e.g. iOS Safari cannot vibrate).
const vibrationSupported = ref(false)
// Bumped on every alert; the flash restarts when it changes.
const flashKey = ref(0)
const flashing = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null
let ctx: AudioContext | null = null
let listening = false

type AudioContextCtor = typeof AudioContext
const UNLOCK_EVENTS = ['click', 'touchend', 'keydown'] as const

function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
}

async function unlock(): Promise<void> {
  if (ctx?.state === 'running') return
  const Ctor = audioContextCtor()
  if (!Ctor) return
  try {
    ctx ??= new Ctor()
    await ctx.resume()
    unlocked.value = ctx.state === 'running'
  }
  catch {
    unlocked.value = false
  }
}

function onGesture() {
  void unlock()
}

// Two short, bright tones: audible over a noisy tent.
function beep(): void {
  if (mode.value !== 'loud' || !ctx || ctx.state !== 'running') return
  const start = ctx.currentTime
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t0 = start + i * 0.18
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.16)
  }
}

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function vibrate(): void {
  if (mode.value === 'silent' || !canVibrate()) return
  try {
    navigator.vibrate([200, 100, 200])
  }
  catch { /* not supported */ }
}

function flash(): void {
  flashKey.value += 1
  flashing.value = true
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashing.value = false }, FLASH_MS)
}

function readMode(): AlertMode {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    if (saved && (ALERT_MODES as string[]).includes(saved)) return saved as AlertMode
    if (localStorage.getItem(OLD_SOUND_KEY) !== 'off') return 'loud'
    return localStorage.getItem(OLD_VIBRATION_KEY) === 'off' ? 'silent' : 'vibrate'
  }
  catch {
    return 'loud'
  }
}

// Client only, from onMounted: reads the mode and waits for a gesture.
function init(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  mode.value = readMode()
  vibrationSupported.value = canVibrate()
  // Bubble phase, so a tap on a mode button is handled before it unlocks.
  for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, onGesture, { passive: true })
}

// Picking a mode plays it once as a test (tone, buzz, or just the flash).
async function setMode(next: AlertMode): Promise<void> {
  mode.value = next
  try {
    localStorage.setItem(MODE_KEY, next)
  }
  catch { /* not remembered, still works */ }
  if (next === 'loud') await unlock()
  notify()
}

function notify(): void {
  beep()
  vibrate()
  flash()
}

export function useAttention() {
  return {
    mode: readonly(mode),
    unlocked: readonly(unlocked),
    vibrationSupported: readonly(vibrationSupported),
    flashKey: readonly(flashKey),
    flashing: readonly(flashing),
    init,
    setMode,
    notify,
  }
}

// Tests only: forget the shared state.
export function resetAttention(): void {
  if (typeof window !== 'undefined') {
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, onGesture)
  }
  mode.value = 'loud'
  unlocked.value = false
  vibrationSupported.value = false
  flashKey.value = 0
  flashing.value = false
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = null
  ctx = null
  listening = false
}
