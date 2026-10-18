<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { ProductionOrderGroup } from '~/stores/production'
import NoteBadge from '~/components/common/NoteBadge.vue'
import { shortOrderNo } from '~/utils/order-number'

const props = defineProps<{ group: ProductionOrderGroup; busyIds: Set<string>; finishing?: boolean }>()
const emit = defineEmits<{
  (e: 'advance', orderItemId: string, next: 'in_progress' | 'done'): void
  (e: 'finish'): void
}>()

const { t } = useI18n()
const { itemName } = useFormat()

const label = computed(() => {
  if (props.group.orderKind === 'staff_meal') return t('production.staffMeal')
  if (props.group.orderKind === 'walkin') return t('production.counter')
  return t('staff.detail.table', { n: props.group.tableNo })
})

const minutes = computed(() => Math.max(0, Math.floor((Date.now() - new Date(props.group.orderedAt).getTime()) / 60_000)))
const ageClass = computed(() => {
  if (minutes.value >= 10) return 'bg-rose-100 text-rose-800'
  if (minutes.value >= 5) return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-600'
})
const started = computed(() => props.group.items.some((i) => i.productionStatus === 'in_progress'))
</script>

<template>
  <article
    data-test="order-card"
    class="flex h-full flex-col rounded-xl border-2 bg-surface p-4 shadow-sm"
    :class="started ? 'border-brand' : 'border-slate-200'"
  >
    <header class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <h2 class="text-2xl font-black text-slate-900">
          {{ label }}
        </h2>
        <p class="font-mono text-sm font-semibold tracking-wider text-slate-500" data-test="order-number">
          {{ $t('common.orderNo', { no: shortOrderNo(group.orderId) }) }}
        </p>
      </div>
      <span :class="['rounded-full px-2 py-1 text-sm font-semibold', ageClass]">
        {{ $t('production.waiting', { n: minutes }) }}
      </span>
    </header>

    <ul class="mt-3 flex-1 divide-y divide-slate-100">
      <li v-for="item in group.items" :key="item.orderItemId" class="flex items-center gap-3 py-2">
        <div class="min-w-0 flex-1">
          <p class="text-xl font-semibold" :class="item.productionStatus === 'in_progress' ? 'text-brand-ink' : 'text-slate-900'">
            {{ item.quantity }} × {{ itemName(item) }}
          </p>
          <NoteBadge :note="item.note" large />
        </div>
        <button
          type="button"
          class="min-h-[44px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-60"
          :class="item.productionStatus === 'pending' ? 'border-slate-300 text-slate-700' : 'border-emerald-600 text-emerald-800'"
          :disabled="busyIds.has(item.orderItemId)"
          @click="emit('advance', item.orderItemId, item.productionStatus === 'pending' ? 'in_progress' : 'done')"
        >
          {{ item.productionStatus === 'pending' ? $t('production.start') : $t('production.done') }}
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="mt-3 min-h-[56px] w-full rounded-lg bg-success text-lg font-bold text-white hover:bg-success-hover disabled:opacity-60"
      :disabled="finishing"
      @click="emit('finish')"
    >
      {{ finishing ? '…' : $t('production.finishOrder', { label }) }}
    </button>
  </article>
</template>
