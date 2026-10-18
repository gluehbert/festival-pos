<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'
import NoteBadge from '~/components/common/NoteBadge.vue'
import { shortOrderNo } from '~/utils/order-number'

interface Props {
  item: TicketDetailItem
  selectable?: boolean
  selected?: boolean
  canVoid?: boolean
  /** Admin: may also void items kitchen/bar already finished. */
  canVoidFinished?: boolean
  canRefund?: boolean
  /** Walk-in: paid items are still collected at the counter. */
  walkin?: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'toggle' | 'void' | 'refund'): void
}>()

// Waiters void only what is not finished yet; see the void endpoint.
const showVoid = computed(() => props.canVoid
  && props.item.paymentStatus === 'unpaid'
  && (props.item.productionStatus === 'pending' || props.item.productionStatus === 'in_progress'
    || (props.canVoidFinished && props.item.productionStatus === 'done')))
const lineCents = computed(() => props.item.quantity * (props.item.unitPriceCents + (props.item.depositCents ?? 0)))
const { t } = useI18n()
const { euro, itemName } = useFormat()
const lineEur = computed(() => euro(lineCents.value))

const statusBadge = computed(() => {
  if (props.item.productionStatus === 'cancelled') return { label: t('staff.ticket.voided'), cls: 'bg-rose-100 text-rose-700' }
  if (props.item.paymentStatus === 'paid') return { label: t('staff.ticket.paid'), cls: 'bg-emerald-100 text-emerald-700' }
  return { label: t('staff.ticket.open'), cls: 'bg-slate-200 text-slate-700' }
})
</script>

<template>
  <li class="flex items-center gap-3 border-b border-slate-100 py-2 last:border-b-0">
    <input
      v-if="selectable && item.productionStatus !== 'cancelled' && item.paymentStatus === 'unpaid'"
      type="checkbox"
      :checked="selected"
      class="h-5 w-5 accent-brand"
      :aria-label="$t('staff.pay.selectItem', { name: itemName(item) })"
      @change="emit('toggle')"
    >
    <div class="flex-1">
      <p class="text-sm font-medium text-slate-900">
        {{ item.quantity }} × {{ itemName(item) }}
      </p>
      <NoteBadge :note="item.note" />
      <p class="text-xs text-slate-500">
        {{ lineEur }}
        <template v-if="item.depositCents > 0">· {{ $t('common.deposit.includedShort', { amount: euro(item.depositCents * item.quantity) }) }}</template>
        · <span class="font-mono tracking-wider" data-test="order-number">{{ $t('common.orderNo', { no: shortOrderNo(item.orderId) }) }}</span>
      </p>
    </div>
    <span
      v-if="item.productionStatus === 'done' && !item.served && (walkin || item.paymentStatus === 'unpaid')"
      class="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700"
    >{{ $t('staff.ticket.readyToServe') }}</span>
    <span :class="['rounded-full px-2 py-0.5 text-xs', statusBadge.cls]">{{ statusBadge.label }}</span>
    <button
      v-if="showVoid"
      type="button"
      class="min-h-[44px] rounded border border-rose-300 px-3 text-sm text-rose-700 hover:bg-rose-50"
      @click="emit('void')"
    >
      {{ $t('staff.void.button') }}
    </button>
    <button
      v-if="canRefund && item.productionStatus !== 'cancelled' && item.paymentStatus === 'paid'"
      type="button"
      class="min-h-[44px] rounded border border-amber-300 px-3 text-sm text-amber-800 hover:bg-amber-50"
      @click="emit('refund')"
    >
      {{ $t('staff.refund.button') }}
    </button>
  </li>
</template>
