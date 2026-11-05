<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAttention } from '~/composables/useAttention'
import AlertToggles from '~/components/common/AlertToggles.vue'
// Header bell: shows the alert mode at a glance, with the same symbols as a
// phone (bell with waves, vibrating phone, crossed-out bell); the modes sit
// in its popover. "locked" = loud, but the browser still blocks the tone.
const { mode, unlocked, init } = useAttention()
// The popover content mounts lazily, so the setting is read here.
onMounted(init)
const state = computed(() => (mode.value === 'loud' && !unlocked.value ? 'locked' : mode.value))
const icon = computed(() => ({ loud: 'i-lucide-bell-ring', locked: 'i-lucide-bell', vibrate: 'i-lucide-vibrate', silent: 'i-lucide-bell-off' })[state.value])
</script>

<template>
  <UPopover :ui="{ content: 'bg-surface ring-slate-200' }">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded md:px-2"
      :class="state === 'locked' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'"
      :aria-label="`${$t('alerts.label')}: ${$t(`alerts.state.${state}`)}`"
      :title="$t(`alerts.state.${state}`)"
      data-test="alert-bell"
      :data-state="state"
    >
      <UIcon :name="icon" class="size-5" aria-hidden="true" />
      <!-- From tablet width there is room for the word: a symbol alone is guesswork once a year. -->
      <span class="hidden text-sm font-semibold md:inline" aria-hidden="true" data-test="alert-bell-label">{{ $t('alerts.short') }}</span>
    </button>
    <template #content>
      <div class="p-3">
        <AlertToggles />
      </div>
    </template>
  </UPopover>
</template>
