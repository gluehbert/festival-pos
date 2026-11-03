<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import { syncErrorKind } from '~/utils/sync-error'

// Polls fail: what the screen shows may be outdated. Shown until a poll
// succeeds again; `since` is the time of the last successful one, `error`
// the last failure, which picks the text.
const props = defineProps<{ failed: boolean; since: number | null; error?: unknown }>()
defineEmits<{ retry: [] }>()

const { time } = useFormat()
const kind = computed(() => syncErrorKind(props.error))
const text = computed(() => {
  if (kind.value !== 'offline') return `common.stale.${kind.value}`
  return props.since === null ? 'common.stale.never' : 'common.stale.since'
})
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
      <span>
        {{ $t(text, { time: since === null ? '' : time(since) }) }}
        <span v-if="kind !== 'offline' && since !== null" class="block text-sm font-normal">
          {{ $t('common.stale.lastSync', { time: time(since) }) }}
        </span>
      </span>
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
