<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'
import NoteBadge from '~/components/common/NoteBadge.vue'

interface Props {
  item: ProductionQueueItem
  busy?: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'advance', next: 'in_progress' | 'done'): void
}>()

const minutesInQueue = computed(() => {
  const ms = Date.now() - new Date(props.item.orderedAt).getTime()
  return Math.max(0, Math.floor(ms / 60_000))
})

const nextStatus = computed<'in_progress' | 'done'>(() =>
  props.item.productionStatus === 'pending' ? 'in_progress' : 'done',
)

const { t } = useI18n()
const { itemName } = useFormat()
const buttonLabel = computed(() =>
  props.item.productionStatus === 'pending' ? t('production.start') : t('production.done'),
)

const buttonClass = computed(() =>
  props.item.productionStatus === 'pending'
    ? 'bg-brand text-brand-contrast hover:brightness-95 active:brightness-90'
    : 'bg-success text-white hover:bg-success-hover',
)

const ageClass = computed(() => {
  if (minutesInQueue.value >= 10) return 'text-rose-700 font-semibold'
  if (minutesInQueue.value >= 5) return 'text-amber-700'
  return 'text-slate-500'
})
</script>

<template>
  <article
    data-test="queue-item"
    class="rounded-xl border-2 bg-surface p-4 shadow-sm"
    :class="item.productionStatus === 'in_progress' ? 'border-brand' : 'border-slate-200'"
  >
    <header class="flex items-baseline justify-between gap-2">
      <p class="text-lg font-bold text-slate-900">
        {{ item.orderKind === 'staff_meal' ? $t('production.staffMeal') : item.orderKind === 'walkin' ? $t('production.counter') : $t('staff.detail.table', { n: item.tableNo }) }}
      </p>
      <p :class="['text-xs', ageClass]">
        {{ $t('production.waiting', { n: minutesInQueue }) }}
      </p>
    </header>
    <p class="mt-2 text-xl font-semibold text-slate-900">
      {{ item.quantity }} × {{ itemName(item) }}
    </p>
    <NoteBadge :note="item.note" large />
    <button
      type="button"
      class="mt-4 min-h-[56px] w-full rounded-lg text-base font-bold transition disabled:opacity-60"
      :class="buttonClass"
      :disabled="busy"
      @click="emit('advance', nextStatus)"
    >
      {{ busy ? '…' : buttonLabel }}
    </button>
  </article>
</template>
