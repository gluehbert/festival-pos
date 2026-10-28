<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { ProductionOrderGroup } from '~/stores/production'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'
import NoteBadge from '~/components/common/NoteBadge.vue'
import { shortOrderNo } from '~/utils/order-number'

const props = defineProps<{ group: ProductionOrderGroup; busyIds: Set<string>; finishing?: boolean }>()
const emit = defineEmits<{
  (e: 'advance', orderItemIds: string[], next: 'in_progress' | 'done'): void
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
// Rounds ordered at the same table add separate items of the same article.
// Items with the same article, note and status show as one line; its button
// advances all of them.
interface Line { key: string; first: ProductionQueueItem; ids: string[]; quantity: number }
const lines = computed<Line[]>(() => {
  const byKey = new Map<string, Line>()
  for (const item of props.group.items) {
    const key = JSON.stringify([item.nameDe, item.nameEn, item.note ?? '', item.productionStatus])
    const line = byKey.get(key)
    if (line) {
      line.ids.push(item.orderItemId)
      line.quantity += item.quantity
    }
    else byKey.set(key, { key, first: item, ids: [item.orderItemId], quantity: item.quantity })
  }
  return [...byKey.values()]
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
      <li v-for="line in lines" :key="line.key" class="flex items-center gap-3 py-2" data-test="order-line">
        <div class="min-w-0 flex-1">
          <p class="text-xl font-semibold" :class="line.first.productionStatus === 'in_progress' ? 'text-brand-ink' : 'text-slate-900'">
            {{ line.quantity }} × {{ itemName(line.first) }}
          </p>
          <p v-if="line.first.productionStatus === 'in_progress'" class="text-sm font-semibold text-brand-ink">
            {{ $t('production.preparing') }}
          </p>
          <NoteBadge :note="line.first.note" large />
        </div>
        <button
          type="button"
          class="min-h-[44px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-60"
          :class="line.first.productionStatus === 'pending' ? 'border-slate-300 text-slate-700' : 'border-emerald-600 text-emerald-800'"
          :disabled="line.ids.some((id) => busyIds.has(id))"
          @click="emit('advance', line.ids, line.first.productionStatus === 'pending' ? 'in_progress' : 'done')"
        >
          {{ line.first.productionStatus === 'pending' ? $t('production.start') : $t('production.done') }}
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
