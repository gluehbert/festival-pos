<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Kitchen and bar screens hang at a distance: bigger/smaller text and
// fullscreen. The size is remembered per device; storage may be unavailable.
const zoom = defineModel<number>({ default: 1 })

const STEP = 0.1
const MIN = 0.7
const MAX = 1.6
const ZOOM_KEY = 'production-zoom'

function setZoom(v: number) {
  const next = Math.round(Math.min(MAX, Math.max(MIN, v)) * 10) / 10
  zoom.value = next
  try {
    localStorage.setItem(ZOOM_KEY, String(next))
  }
  catch { /* not remembered, still works */ }
}

const canFullscreen = ref(false)
const isFullscreen = ref(false)
const percent = computed(() => Math.round(zoom.value * 100))

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

onMounted(() => {
  try {
    const stored = Number(localStorage.getItem(ZOOM_KEY))
    if (stored >= MIN && stored <= MAX) zoom.value = stored
  }
  catch { /* default size */ }
  canFullscreen.value = document.fullscreenEnabled === true
  syncFullscreen()
  document.addEventListener('fullscreenchange', syncFullscreen)
})

onBeforeUnmount(() => document.removeEventListener('fullscreenchange', syncFullscreen))
</script>

<template>
  <div class="inline-flex items-center gap-1">
    <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1" role="group" :aria-label="$t('production.display.zoomLabel')">
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        :aria-label="$t('production.display.smaller')"
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
        class="inline-flex size-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        :aria-label="$t('production.display.bigger')"
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
      class="inline-flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
      :aria-label="isFullscreen ? $t('production.display.exitFullscreen') : $t('production.display.fullscreen')"
      :aria-pressed="isFullscreen"
      data-test="fullscreen"
      @click="toggleFullscreen"
    >
      <UIcon :name="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'" class="size-5" aria-hidden="true" />
    </button>
  </div>
</template>
