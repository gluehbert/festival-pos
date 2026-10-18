import { readonly, ref } from 'vue'

// Sound + vibration when something needs staff attention (new orders at the
// kitchen / bar, finished items for the service). Shared by all screens: one
// AudioContext; sound and vibration are switched separately, per device (a
// tablet lying on the counter should not rattle).
//
// Browsers block audio until the user interacted with the page, so the
// context is created / resumed on the first tap or key press. The tone is
// synthesised (Web Audio), no asset file needed.

const STORAGE_KEY = 'alert-sound'
const VIBRATION_KEY = 'alert-vibration'
const enabled = ref(true)
const unlocked = ref(false)
const vibrationEnabled = ref(true)
// Only known on the client (e.g. iOS Safari cannot vibrate).
const vibrationSupported = ref(false)
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
  if (!enabled.value || !ctx || ctx.state !== 'running') return
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
  if (!vibrationEnabled.value || !canVibrate()) return
  try {
    navigator.vibrate([200, 100, 200])
  }
  catch { /* not supported */ }
}

function readSetting(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off'
  }
  catch {
    return true
  }
}

function writeSetting(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
  }
  catch { /* not remembered, still works */ }
}

// Client only, from onMounted: reads the setting and waits for a gesture.
function init(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  enabled.value = readSetting(STORAGE_KEY)
  vibrationEnabled.value = readSetting(VIBRATION_KEY)
  vibrationSupported.value = canVibrate()
  // Bubble phase, so a tap on the toggle is handled before it unlocks.
  for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, onGesture, { passive: true })
}

function setEnabled(on: boolean): void {
  enabled.value = on
  writeSetting(STORAGE_KEY, on)
}

// Switching vibration on buzzes once as a test.
function toggleVibration(): void {
  vibrationEnabled.value = !vibrationEnabled.value
  writeSetting(VIBRATION_KEY, vibrationEnabled.value)
  vibrate()
}

// The toggle: while sound is on but still blocked, a tap unlocks it (and
// plays the tone as a test) instead of switching it off.
async function toggle(): Promise<void> {
  if (enabled.value && unlocked.value) {
    setEnabled(false)
    return
  }
  setEnabled(true)
  await unlock()
  beep()
}

function notify(): void {
  beep()
  vibrate()
}

export function useAttention() {
  return {
    enabled: readonly(enabled),
    unlocked: readonly(unlocked),
    vibrationEnabled: readonly(vibrationEnabled),
    vibrationSupported: readonly(vibrationSupported),
    init,
    toggle,
    toggleVibration,
    notify,
  }
}

// Tests only: forget the shared state.
export function resetAttention(): void {
  if (typeof window !== 'undefined') {
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, onGesture)
  }
  enabled.value = true
  unlocked.value = false
  vibrationEnabled.value = true
  vibrationSupported.value = false
  ctx = null
  listening = false
}
