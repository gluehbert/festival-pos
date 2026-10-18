<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'

// Polls fail: what the screen shows may be outdated. Shown until a poll
// succeeds again; `since` is the time of the last successful one.
const props = defineProps<{ failed: boolean; since: number | null }>()
defineEmits<{ retry: [] }>()

const { time } = useFormat()
const text = computed(() => (props.since === null ? 'common.stale.never' : 'common.stale.since'))
</script>

<template>
  <div
    v-if="failed"
    class="sticky top-0 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger px-4 py-3 text-white shadow-lg"
    role="alert"
    data-test="stale-banner"
  >
    <p class="flex items-center gap-2 text-base font-bold">
      <UIcon name="i-lucide-triangle-alert" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t(text, { time: since === null ? '' : time(since) }) }}
    </p>
    <button
      type="button"
      class="min-h-[44px] rounded-lg border-2 border-white px-4 text-sm font-semibold hover:bg-white/10"
      @click="$emit('retry')"
    >
      {{ $t('common.retry') }}
    </button>
  </div>
</template>
