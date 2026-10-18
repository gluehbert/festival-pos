<script setup lang="ts">
import { computed } from 'vue'
import { eventStatus } from '~/composables/useAdminPage'
import type { EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: Pick<EventDto, 'isActive' | 'trialMode' | 'activatedAt'> }>()

const status = computed(() => eventStatus(props.event))
const classes = {
  live: 'bg-emerald-100 text-emerald-800',
  trial: 'bg-amber-100 text-amber-900',
  draft: 'bg-slate-100 text-slate-700',
  ended: 'bg-slate-200 text-slate-600',
} as const
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
    :class="classes[status]"
    :data-status="status"
  >
    <span v-if="status === 'live'" class="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
    {{ $t(`admin.status.${status}`) }}
  </span>
</template>
