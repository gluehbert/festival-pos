<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAttention } from '~/composables/useAttention'

// Sound and vibration switches for the alerts, remembered per device.
const { enabled, unlocked, vibrationEnabled, vibrationSupported, init, toggle, toggleVibration } = useAttention()

onMounted(init)

const sound = computed(() => (!enabled.value ? 'off' : unlocked.value ? 'on' : 'locked'))
const offClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200'
</script>

<template>
  <div class="inline-flex flex-wrap gap-2">
    <button
      type="button"
      class="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold"
      :class="sound === 'off' ? offClass : sound === 'on' ? 'bg-primary text-white' : 'bg-amber-100 text-amber-900'"
      :aria-pressed="enabled"
      :title="$t('alerts.soundLabel')"
      data-test="sound-toggle"
      @click="toggle"
    >
      <UIcon :name="sound === 'off' ? 'i-lucide-bell-off' : sound === 'on' ? 'i-lucide-bell-ring' : 'i-lucide-bell'" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t(`alerts.sound.${sound}`) }}
    </button>
    <button
      v-if="vibrationSupported"
      type="button"
      class="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold"
      :class="vibrationEnabled ? 'bg-primary text-white' : offClass"
      :aria-pressed="vibrationEnabled"
      :title="$t('alerts.vibrationLabel')"
      data-test="vibration-toggle"
      @click="toggleVibration"
    >
      <UIcon name="i-lucide-vibrate" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t(`alerts.vibration.${vibrationEnabled ? 'on' : 'off'}`) }}
    </button>
  </div>
</template>
