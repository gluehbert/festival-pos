<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAttention } from '~/composables/useAttention'
import AlertToggles from '~/components/common/AlertToggles.vue'

// Header bell: shows at a glance whether alerts sound; the switches for
// sound and vibration sit in its popover.
const { enabled, unlocked, init } = useAttention()

// The popover content mounts lazily, so the setting is read here.
onMounted(init)

const sound = computed(() => (!enabled.value ? 'off' : unlocked.value ? 'on' : 'locked'))
const icon = computed(() => ({ off: 'i-lucide-bell-off', on: 'i-lucide-bell-ring', locked: 'i-lucide-bell' })[sound.value])
</script>

<template>
  <UPopover :ui="{ content: 'bg-surface ring-slate-200' }">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded"
      :class="sound === 'locked' ? 'bg-amber-100 text-amber-900' : 'text-slate-600 hover:bg-slate-100'"
      :aria-label="$t('alerts.label')"
      :title="$t(`alerts.sound.${sound}`)"
      data-test="alert-bell"
      :data-state="sound"
    >
      <UIcon :name="icon" class="size-5" aria-hidden="true" />
    </button>
    <template #content>
      <div class="p-3">
        <AlertToggles />
      </div>
    </template>
  </UPopover>
</template>
