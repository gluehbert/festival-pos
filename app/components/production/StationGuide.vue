<script setup lang="ts">
import { computed } from 'vue'
import { useAttention } from '~/composables/useAttention'

// Shown while a station has nothing to do: kitchen, bar and cake counter
// staff work the screen once a year, so the quiet moment explains it in the
// words the buttons use. Bar and cake counter have no "Start" step.
const props = defineProps<{ station: 'kitchen' | 'bar' | 'cafe' }>()
// The first line says what this device actually does: beep, vibrate or only light up.
const { mode } = useAttention()
const ARRIVE = { loud: 'arrive', vibrate: 'arriveVibrate', silent: 'arriveSilent' } as const

const steps = computed(() => [
  { key: ARRIVE[mode.value], icon: 'i-lucide-bell-ring' },
  ...(props.station === 'kitchen' ? [{ key: 'start', icon: 'i-lucide-flame' }] : []),
  { key: 'done', icon: 'i-lucide-check' },
  { key: 'soldOut', icon: 'i-lucide-circle-slash' },
  ...(props.station === 'cafe' ? [{ key: 'cafeClose', icon: 'i-lucide-store' }] : []),
])
</script>

<template>
  <section class="mt-6 max-w-xl rounded-xl border-2 border-slate-200 bg-surface p-4" data-test="station-guide" :aria-label="$t('production.guide.title')">
    <p class="text-sm text-slate-500">
      {{ $t('production.empty') }}
    </p>
    <h2 class="mt-2 text-lg font-bold text-slate-900">
      {{ $t('production.guide.title') }}
    </h2>
    <ol class="mt-3 flex flex-col gap-3">
      <li v-for="s in steps" :key="s.key" class="flex items-start gap-3" :data-step="s.key">
        <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true">
          <UIcon :name="s.icon" class="size-5" />
        </span>
        <p class="pt-1.5 text-sm text-slate-800">
          {{ $t(`production.guide.${s.key}`) }}
        </p>
      </li>
    </ol>
  </section>
</template>
