<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useProductionStore } from '~/stores/production'
import { useAuthStore } from '~/stores/auth'
import { BUZZERS_PER_STATION } from '~/../server/lib/contracts/production'
import { laneColor } from '~/utils/buzzer-lanes'

// Header icon on the kitchen/bar screen; its popover holds the display
// settings, set once per device: page zoom (for staff who cannot pinch-zoom
// well), fullscreen and keeping the screen on. A page cannot drive the
// browser zoom itself, so it zooms the whole document instead. The settings
// are remembered per device; storage may be unavailable. The popover content
// mounts lazily, so everything that must work while it is closed lives here.
// The menu is a plain dropdown in the header, not a floating popover: a popover
// is placed in screen pixels, which a zoomed page pushes out of the screen.
// It hangs from the header's right edge, not from its icon: the bell and the
// account menu sit right of the icon, so at a high zoom on a phone a panel
// under the icon reached past the left edge.
const STEP = 0.1
const MIN = 0.7
const MAX = 1.6
const ZOOM_KEY = 'production-zoom'
const AWAKE_KEY = 'production-keep-awake'

// Lanes: how many people work side by side at this station (for all its
// screens), and which lanes this device shows (another tablet the rest).
const production = useProductionStore()
const auth = useAuthStore()
const laneBusy = ref(false)
const laneFailed = ref(false)
const stationParam = computed(() => (auth.staff?.role === 'admin' && production.station ? production.station : undefined))
async function setLaneCount(n: number) {
  if (laneBusy.value || n < 1 || n > BUZZERS_PER_STATION) return
  laneBusy.value = true
  laneFailed.value = false
  try {
    await production.setLanes({ laneCount: n }, stationParam.value)
  }
  catch {
    laneFailed.value = true
  }
  finally {
    laneBusy.value = false
  }
}

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

const pill = 'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap'
const offClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200'
const roundButton = 'inline-flex size-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200 disabled:opacity-40'
</script>

<template>
  <div ref="root">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded px-1 md:flex-row md:gap-1.5 text-slate-600 hover:bg-slate-100 md:px-2"
      :aria-label="$t('production.display.label')"
      :title="$t('production.display.label')"
      :aria-expanded="open"
      data-test="display-menu"
      @click="open = !open"
    >
      <UIcon name="i-lucide-monitor" class="size-5" aria-hidden="true" />
      <span class="text-[10px] font-semibold leading-none md:text-sm" aria-hidden="true" data-test="display-menu-label">{{ $t('production.display.label') }}</span>
    </button>
    <div
      v-if="open"
      class="absolute right-2 top-full z-50 mt-1 flex flex-col items-start gap-2 rounded-lg bg-surface p-3 shadow-lg ring-1 ring-slate-200"
      data-test="display-panel"
    >
      <template v-if="production.station">
        <p class="text-sm font-semibold text-slate-700">{{ $t('production.display.lanes') }}</p>
        <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1" role="group" :aria-label="$t('production.display.lanes')">
          <button
            type="button"
            :class="roundButton"
            :aria-label="$t('production.display.lanesFewer')"
            :disabled="laneBusy || production.laneCount <= 1"
            data-test="lanes-fewer"
            @click="setLaneCount(production.laneCount - 1)"
          >
            <UIcon name="i-lucide-minus" class="size-5" aria-hidden="true" />
          </button>
          <span class="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-slate-700" data-test="lanes-value">
            {{ production.laneCount }}
          </span>
          <button
            type="button"
            :class="roundButton"
            :aria-label="$t('production.display.lanesMore')"
            :disabled="laneBusy || production.laneCount >= BUZZERS_PER_STATION"
            data-test="lanes-more"
            @click="setLaneCount(production.laneCount + 1)"
          >
            <UIcon name="i-lucide-plus" class="size-5" aria-hidden="true" />
          </button>
        </div>
        <p class="max-w-64 text-xs text-slate-600">{{ $t('production.display.lanesHint') }}</p>
        <p v-if="laneFailed" class="text-xs font-semibold text-rose-700" role="alert">{{ $t('production.toastFailed') }}</p>
        <template v-if="production.lanes.length > 1">
          <p class="text-sm font-semibold text-slate-700">{{ $t('production.display.shown') }}</p>
          <div class="flex flex-wrap gap-1" data-test="lanes-shown">
            <button
              v-for="l in production.lanes"
              :key="l.lane"
              type="button"
              :class="[pill, production.hiddenLanes.includes(l.lane) ? offClass : [laneColor(l.color).bg, 'text-white']]"
              :aria-pressed="!production.hiddenLanes.includes(l.lane)"
              :data-test="`lane-shown-${l.lane}`"
              @click="production.setLaneShown(l.lane, production.hiddenLanes.includes(l.lane))"
            >
              <span class="flex size-6 items-center justify-center rounded-full bg-white text-xs font-black" :class="laneColor(l.color).text">{{ l.lane }}</span>
              {{ $t(`production.lanes.color.${l.color}`) }}
            </button>
          </div>
        </template>
        <hr class="w-full border-slate-200">
      </template>
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
