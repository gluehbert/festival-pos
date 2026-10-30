<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { ProductionOrderGroup } from '~/stores/production'
import NoteBadge from '~/components/common/NoteBadge.vue'
import { shortOrderNo } from '~/utils/order-number'
import { ageClass as ageBadge, cardLines, groupLabel, minutesWaiting, type CardLine } from '~/utils/production-card'

// oneStep: the bar skips "Start" and finishes open items in one tap.
const props = defineProps<{ group: ProductionOrderGroup; busyIds: Set<string>; finishing?: boolean; oneStep?: boolean }>()
const emit = defineEmits<{
  (e: 'advance', orderItemIds: string[], next: 'in_progress' | 'done'): void
  (e: 'finish'): void
}>()

const { t } = useI18n()
const { itemName } = useFormat()

const label = computed(() => groupLabel(props.group, t))

const orderNos = computed(() => {
  const nos = props.group.orderIds.map((id) => `#${shortOrderNo(id)}`)
  return nos.length === 1
    ? t('common.orderNo', { no: shortOrderNo(props.group.orderIds[0]!) })
    : t('production.orderNos', { nos: nos.join(' · ') })
})

const minutes = computed(() => minutesWaiting(props.group))
const ageClass = computed(() => ageBadge(minutes.value))

const lines = computed(() => cardLines(props.group.items))

function next(line: CardLine): 'in_progress' | 'done' {
  return line.first.productionStatus === 'pending' && !props.oneStep ? 'in_progress' : 'done'
}
</script>

<template>
  <article data-test="order-card" class="flex h-full flex-col rounded-xl border-2 border-slate-200 bg-surface p-4 shadow-sm">
    <header class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 class="text-2xl font-black text-slate-900">
          {{ label }}
        </h2>
        <p class="font-mono text-sm font-semibold tracking-wider text-slate-500" data-test="order-number">
          {{ orderNos }}
        </p>
      </div>
      <span :class="['shrink-0 rounded-full px-2 py-1 text-sm font-semibold', ageClass]">
        {{ $t('production.waiting', { n: minutes }) }}
      </span>
    </header>

    <ul class="mt-3 flex-1 divide-y divide-slate-100">
      <li v-for="line in lines" :key="line.key" class="flex items-center gap-3 py-2" data-test="order-line">
        <div class="min-w-0 flex-1">
          <p class="text-xl font-semibold text-slate-900">
            {{ line.quantity }} × {{ itemName(line.first) }}
          </p>
          <p v-if="line.first.productionStatus === 'in_progress' && !oneStep" class="flex items-center gap-1 text-sm font-semibold text-slate-500">
            <UIcon name="i-lucide-timer" class="size-4 shrink-0" aria-hidden="true" />
            {{ $t('production.preparing') }}
          </p>
          <NoteBadge :note="line.first.note" large />
        </div>
        <button
          type="button"
          class="min-h-[44px] rounded-lg px-3 text-sm font-semibold disabled:opacity-60"
          :class="next(line) === 'in_progress' ? 'border border-slate-300 text-slate-700' : 'bg-success text-white hover:bg-success-hover'"
          :disabled="line.ids.some((id) => busyIds.has(id))"
          @click="emit('advance', line.ids, next(line))"
        >
          {{ next(line) === 'in_progress' ? $t('production.start') : $t('production.done') }}
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="mt-3 min-h-[56px] w-full rounded-lg border-2 border-success text-lg font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
      :disabled="finishing"
      @click="emit('finish')"
    >
      {{ finishing ? '…' : $t('production.finishOrder', { label }) }}
    </button>
  </article>
</template>
