<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Header icon on the kitchen/bar screen; its popover holds the display
// settings, set once per device: page zoom (for staff who cannot pinch-zoom
// well), fullscreen and keeping the screen on. A page cannot drive the
// browser zoom itself, so it zooms the whole document instead. The settings
// are remembered per device; storage may be unavailable. The popover content
// mounts lazily, so everything that must work while it is closed lives here.
// The menu is a plain dropdown in the header, not a floating popover: a popover
// is placed in screen pixels, which a zoomed page pushes out of the screen.
const STEP = 0.1
const MIN = 0.7
const MAX = 1.6
const ZOOM_KEY = 'production-zoom'
const AWAKE_KEY = 'production-keep-awake'

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const zoom = ref(1)
const percent = computed(() => Math.round(zoom.value * 100))

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  }
  catch { /* not remembered, still works */ }
}

function applyZoom() {
  document.documentElement.style.zoom = zoom.value === 1 ? '' : String(zoom.value)
}

function setZoom(v: number) {
  zoom.value = Math.round(Math.min(MAX, Math.max(MIN, v)) * 10) / 10
  applyZoom()
  remember(ZOOM_KEY, String(zoom.value))
}

const canFullscreen = ref(false)
const isFullscreen = ref(false)

function syncFullscreen() {
  isFullscreen.value = !!document.fullscreenElement
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }
  catch { /* refused by the browser, the screen stays as it is */ }
}

// On by default: a kitchen screen that goes dark misses orders. The browser
// drops the lock whenever the page is hidden, so it is taken again on return.
const canKeepAwake = ref(false)
const keepAwake = ref(true)
let lock: WakeLockSentinel | null = null

async function requestLock() {
  if (!canKeepAwake.value || !keepAwake.value || lock || document.visibilityState !== 'visible') return
  try {
    lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => { lock = null })
  }
  catch { /* refused (e.g. battery saver), the screen may turn off */ }
}

function releaseLock() {
  void lock?.release()
  lock = null
}

function toggleKeepAwake() {
  keepAwake.value = !keepAwake.value
  remember(AWAKE_KEY, keepAwake.value ? 'on' : 'off')
  if (keepAwake.value) void requestLock()
  else releaseLock()
}

function onVisibility() {
  void requestLock()
}

function onOutside(e: Event) {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false
}
function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  try {
    const stored = Number(localStorage.getItem(ZOOM_KEY))
    if (stored >= MIN && stored <= MAX) zoom.value = stored
    keepAwake.value = localStorage.getItem(AWAKE_KEY) !== 'off'
  }
  catch { /* defaults */ }
  applyZoom()
  canFullscreen.value = document.fullscreenEnabled === true
  syncFullscreen()
  document.addEventListener('fullscreenchange', syncFullscreen)
  canKeepAwake.value = 'wakeLock' in navigator
  void requestLock()
  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('keydown', onEscape)
})

// Other screens keep their normal size and may sleep again.
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('visibilitychange', onVisibility)
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('keydown', onEscape)
  document.documentElement.style.zoom = ''
  releaseLock()
})

const pill = 'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold'
const offClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200'
const roundButton = 'inline-flex size-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200 disabled:opacity-40'
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-slate-600 hover:bg-slate-100"
      :aria-label="$t('production.display.label')"
      :title="$t('production.display.label')"
      :aria-expanded="open"
      data-test="display-menu"
      @click="open = !open"
    >
      <UIcon name="i-lucide-monitor" class="size-5" aria-hidden="true" />
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full z-50 mt-1 flex flex-col items-start gap-2 rounded-lg bg-surface p-3 shadow-lg ring-1 ring-slate-200"
      data-test="display-panel"
    >
      <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1" role="group" :aria-label="$t('production.display.zoomLabel')">
        <button
          type="button"
          :class="roundButton"
          :aria-label="$t('production.display.zoomOut')"
          :disabled="zoom <= MIN"
          data-test="zoom-out"
          @click="setZoom(zoom - STEP)"
        >
          <UIcon name="i-lucide-minus" class="size-5" aria-hidden="true" />
        </button>
        <span class="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-slate-700" data-test="zoom-value">
          {{ percent }} %
        </span>
        <button
          type="button"
          :class="roundButton"
          :aria-label="$t('production.display.zoomIn')"
          :disabled="zoom >= MAX"
          data-test="zoom-in"
          @click="setZoom(zoom + STEP)"
        >
          <UIcon name="i-lucide-plus" class="size-5" aria-hidden="true" />
        </button>
      </div>
      <button
        v-if="canFullscreen"
        type="button"
        :class="[pill, isFullscreen ? 'bg-primary text-white' : offClass]"
        :aria-pressed="isFullscreen"
        data-test="fullscreen"
        @click="toggleFullscreen"
      >
        <UIcon :name="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" class="size-4 shrink-0" aria-hidden="true" />
        {{ isFullscreen ? $t('production.display.exitFullscreen') : $t('production.display.fullscreen') }}
      </button>
      <button
        v-if="canKeepAwake"
        type="button"
        :class="[pill, keepAwake ? 'bg-primary text-white' : offClass]"
        :aria-pressed="keepAwake"
        data-test="keep-awake"
        @click="toggleKeepAwake"
      >
        <UIcon :name="keepAwake ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4 shrink-0" aria-hidden="true" />
        {{ keepAwake ? $t('production.display.keepAwakeOn') : $t('production.display.keepAwakeOff') }}
      </button>
    </div>
  </div>
</template>
