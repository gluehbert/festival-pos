<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import { shortOrderNo } from '~/utils/order-number'
import TableActivity from '~/components/staff/TableActivity.vue'
import ReadyBadges from '~/components/staff/ReadyBadges.vue'
import type { TicketSummary } from '~/../server/lib/contracts/staff'
import type { Assignee } from '~/../server/lib/contracts/tables'

interface Props {
  ticket: TicketSummary
  clockOffsetMs?: number
  // Who looks after the table (walk-in: who took it); mine = the viewer.
  assignee?: Assignee | null
  mine?: boolean
  // Under "Meine Tische" every card is the viewer's: no owner line needed.
  showOwner?: boolean
}
const props = withDefaults(defineProps<Props>(), { clockOffsetMs: 0, assignee: null, mine: false, showOwner: true })

const { t } = useI18n()
const { euro } = useFormat()
const label = computed(() => {
  // Several walk-ins can be open at once: the order number tells them apart.
  if (props.ticket.ticketKey.startsWith('w-')) return `${t('staff.detail.walkin')} #${shortOrderNo(props.ticket.ticketKey.slice(2))}`
  return t('staff.detail.table', { n: props.ticket.tableNo })
})

const totalEur = computed(() => euro(props.ticket.totalCents))
const unpaidEur = computed(() => euro(props.ticket.unpaidCents))
const since = computed(() => {
  const since = new Date(props.ticket.oldestItemAt).getTime()
  const mins = Math.floor((Date.now() - since) / 60_000)
  // Since the table's first order; the time since the last one is TableActivity.
  if (mins < 1) return t('staff.ticket.openJustNow')
  if (mins < 60) return t('staff.ticket.openSince', { n: mins })
  return t('staff.ticket.openSinceHours', { h: Math.floor(mins / 60), m: mins % 60 })
})

const hasReady = computed(() => props.ticket.ready.kitchen + props.ticket.ready.bar + props.ticket.ready.cafe > 0)

const targetHref = computed(() => {
  if (props.ticket.ticketKey.startsWith('w-')) return `/staff/${props.ticket.ticketKey}`
  return `/staff/${props.ticket.tableNo}`
})
</script>

<template>
  <NuxtLink
    :to="targetHref"
    class="block rounded-lg border bg-surface p-4 shadow-sm transition hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
    :class="[ticket.lockedBy ? 'border-amber-400 bg-amber-50' : hasReady || ticket.foodToPay > 0 ? 'border-rose-500 border-2' : 'border-slate-200']"
  >
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="text-xs uppercase tracking-wide text-slate-500">
          {{ label }}
        </p>
        <p class="text-lg font-semibold text-slate-900">
          {{ unpaidEur }}
        </p>
      </div>
      <span
        class="rounded-full px-2 py-0.5 text-xs font-semibold"
        :class="ticket.status === 'open' ? 'bg-brand-soft text-brand-ink' : 'bg-emerald-100 text-emerald-700'"
      >{{ ticket.status === 'open' ? $t('staff.ticket.open') : $t('staff.ticket.paid') }}</span>
    </div>
    <p class="mt-1 text-xs text-slate-500">
      {{ since }}<span v-if="ticket.totalCents !== ticket.unpaidCents"> · {{ $t('staff.ticket.total', { amount: totalEur }) }}</span>
    </p>
    <TableActivity
      v-if="!ticket.ticketKey.startsWith('w-')"
      class="mt-1"
      :last-order-at="ticket.lastOrderAt"
      :last-check-at="ticket.lastCheckAt"
      :clock-offset-ms="clockOffsetMs"
    />
    <p v-if="showOwner" class="mt-1 flex items-center gap-1 text-xs" :class="mine ? 'font-semibold text-brand-ink' : 'text-slate-600'" data-test="ticket-assignee">
      <UIcon :name="mine ? 'i-lucide-star' : 'i-lucide-user'" class="size-3.5 shrink-0" aria-hidden="true" />
      <template v-if="mine">
        {{ $t('staff.assign.mine') }}
      </template>
      <template v-else-if="assignee">
        {{ $t('staff.assign.heldBy', { name: assignee.username }) }}
      </template>
      <template v-else>
        {{ $t('staff.assign.free') }}
      </template>
    </p>
    <p v-if="ticket.foodToPay > 0" class="mt-2 flex items-center gap-1 text-sm font-bold text-sky-800" data-test="ticket-food-to-pay">
      <UIcon name="i-lucide-banknote" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('staff.ticket.foodToPay', { n: ticket.foodToPay }) }}
    </p>
    <ReadyBadges v-if="hasReady" :ready="ticket.ready" class="mt-2 text-rose-700" data-test="ticket-ready" />
    <p v-if="ticket.lockedBy" class="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-700">
      <UIcon name="i-lucide-lock" class="size-3.5 shrink-0" aria-hidden="true" /> {{ $t('staff.ticket.locked') }}
    </p>
  </NuxtLink>
</template>
