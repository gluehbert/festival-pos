<script setup lang="ts">
import { onMounted } from 'vue'
import { ALERT_MODES, useAttention } from '~/composables/useAttention'

// The alert mode of this device, as on a phone: loud, vibration only, silent.
// Remembered per device; the screen flashes in every mode.
const { mode, vibrationSupported, init, setMode } = useAttention()

onMounted(init)

const ICONS = { loud: 'i-lucide-bell-ring', vibrate: 'i-lucide-vibrate', silent: 'i-lucide-bell-off' } as const
</script>

<template>
  <div class="flex w-64 flex-col gap-2">
    <span class="text-xs text-slate-500">{{ $t('alerts.modeLabel') }}</span>
    <div role="radiogroup" :aria-label="$t('alerts.modeLabel')" class="flex flex-col gap-1" data-test="alert-modes">
      <button
        v-for="m in ALERT_MODES"
        :key="m"
        type="button"
        role="radio"
        :aria-checked="mode === m"
        class="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold"
        :class="mode === m ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100'"
        :data-mode="m"
        @click="setMode(m)"
      >
        <UIcon :name="ICONS[m]" class="size-5 shrink-0" aria-hidden="true" />
        {{ $t(`alerts.mode.${m}`) }}
      </button>
    </div>
    <p class="text-xs text-slate-500">
      {{ $t('alerts.flashHint') }}
    </p>
    <p v-if="mode === 'vibrate' && !vibrationSupported" class="text-xs text-amber-800" data-test="no-vibration">
      {{ $t('alerts.noVibration') }}
    </p>
  </div>
</template>
