<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useTicketsStore } from '~/stores/tickets'
import { usePaymentsStore } from '~/stores/payments'
import { usePolling } from '~/composables/usePolling'
import { useFormat } from '~/composables/useFormat'
import ItemRow from '~/components/staff/ItemRow.vue'
import VoidDialog from '~/components/staff/VoidDialog.vue'
import ReadyBanner from '~/components/staff/ReadyBanner.vue'
import TableActivity from '~/components/staff/TableActivity.vue'
import StaleBanner from '~/components/common/StaleBanner.vue'
import TableAssignment from '~/components/staff/TableAssignment.vue'
import { useAttention } from '~/composables/useAttention'
import { createIncreaseTracker } from '~/utils/arrivals'
import type { TicketDetailItem } from '~/../server/lib/contracts/staff'

const { euro, itemName } = useFormat()
const route = useRoute()
const auth = useAuthStore()
const tickets = useTicketsStore()
const payments = usePaymentsStore()

const tableParam = computed(() => String(route.params.table ?? ''))
const ticketKey = computed(() => {
  const v = tableParam.value
  if (v.startsWith('w-')) return v
  return `t-${Number.parseInt(v, 10)}`
})

const voidTarget = ref<TicketDetailItem | null>(null)
const refundMode = ref(false)

function openDialog(item: TicketDetailItem, refund: boolean) {
  refundMode.value = refund
  voidTarget.value = item
}

async function load() {
  await tickets.load(ticketKey.value)
  // Nothing ordered yet: the owner comes from the overview list.
  if (tickets.missing && tableNo.value !== null) await tickets.refresh({ status: 'open' }).catch(() => {})
}

// For the poller: a failed load must throw so it backs off.
async function poll() {
  if (!(await tickets.load(ticketKey.value)) && !tickets.missing) throw tickets.error
}

const tableNo = computed(() => (ticketKey.value.startsWith('t-') ? Number.parseInt(ticketKey.value.slice(2), 10) : null))
const assignee = computed(() => {
  if (ticket.value) return ticket.value.assignee
  const a = tickets.assignments.find((x) => x.tableNo === tableNo.value)
  return a ? { staffId: a.staffId, username: a.username } : null
})

onMounted(async () => {
  if (!auth.isAuthenticated) {
    const me = await auth.refresh()
    if (!me) {
      await navigateTo('/staff/login')
      return
    }
  }
  await load()
})

const polling = usePolling(poll, { intervalMs: 4000, immediate: false, maxBackoffMs: 30_000 })

async function confirmVoid(reason: string) {
  if (!voidTarget.value) return
  const ok = refundMode.value
    ? await payments.refundItem(voidTarget.value.orderItemId, reason)
    : await payments.voidItem(voidTarget.value.orderItemId, reason)
  if (ok) {
    voidTarget.value = null
    await load()
  }
}

function goPay() {
  navigateTo(`/staff/${tableParam.value}/pay`)
}

const walkin = computed(() => ticketKey.value.startsWith('w-'))
const ready = computed(() => {
  const r = { kitchen: 0, bar: 0 }
  for (const i of ticket.value?.items ?? []) {
    // Same rule as the overview: at a table, paid items are not the waiter's
    // to bring; a walk-in pays first and collects at the counter.
    if (i.productionStatus === 'done' && !i.served && (walkin.value || i.paymentStatus === 'unpaid')) r[i.station] += i.quantity
  }
  return r
})

// More finished items at this table: tone + vibration.
const attention = useAttention()
const readyTracker = createIncreaseTracker()
watch(() => tickets.lastSyncAt, () => {
  if (tickets.selected?.ticketKey !== ticketKey.value) return
  if (readyTracker.update(new Map([['ready', ready.value.kitchen + ready.value.bar]])).length > 0) attention.notify()
})

// Per station: food and drinks are often brought separately.
const serving = ref(false)
async function served(station: 'kitchen' | 'bar') {
  serving.value = true
  try {
    if (await tickets.markServed(ticketKey.value, station)) await load()
  }
  finally {
    serving.value = false
  }
}

// Asked at the table, nobody wanted anything: restarts "vor X Min.".
const checking = ref(false)
async function checked() {
  checking.value = true
  try {
    if (await tickets.markChecked(ticketKey.value)) await load()
  }
  finally {
    checking.value = false
  }
}

const canVoid = computed(() => auth.hasRole(['waiter', 'lead', 'admin']))
const canRefund = computed(() => auth.hasRole(['lead', 'admin']))
// Voiding finished items stays with the shift lead and the admin (server rule).
const canVoidFinished = computed(() => auth.hasRole(['lead', 'admin']))
const ticket = computed(() => tickets.selected)
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 py-6">
    <NuxtLink to="/staff" class="inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.back') }}
    </NuxtLink>
    <StaleBanner :failed="tickets.syncFailed" :since="tickets.lastSyncAt" @retry="polling.refresh()" />
    <header v-if="ticket" class="mt-3 flex items-end justify-between">
      <div>
        <p class="text-xs uppercase tracking-wide text-slate-500">
          {{ ticketKey.startsWith('w-') ? $t('staff.detail.walkin') : $t('staff.detail.table', { n: ticket.tableNo }) }}
        </p>
        <h1 class="text-2xl font-bold text-slate-900">
          {{ euro(ticket.unpaidCents) }} <span class="text-base text-slate-500">{{ $t('staff.detail.open') }}</span>
        </h1>
      </div>
      <div class="flex gap-2">
        <NuxtLink
          v-if="!ticketKey.startsWith('w-')"
          :to="`/staff/order?table=${ticket.tableNo}`"
          class="rounded border-2 border-slate-300 bg-surface px-4 py-3 font-semibold text-slate-900"
        >
          {{ $t('staff.detail.addOrder') }}
        </NuxtLink>
        <button
          type="button"
          class="rounded bg-brand-gradient px-4 py-3 font-semibold text-brand-contrast disabled:bg-slate-300 disabled:bg-none"
          :disabled="ticket.status === 'paid' || ticket.unpaidCents === 0"
          @click="goPay"
        >
          {{ $t('staff.detail.cashier') }}
        </button>
      </div>
    </header>

    <template v-if="!ticket && tickets.missing && tableNo !== null && tableNo > 0">
      <header class="mt-3 flex items-end justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-wide text-slate-500">
            {{ $t('staff.detail.table', { n: tableNo }) }}
          </p>
          <h1 class="text-xl font-bold text-slate-900">
            {{ $t('staff.detail.empty') }}
          </h1>
        </div>
        <NuxtLink
          :to="`/staff/order?table=${tableNo}`"
          class="inline-flex min-h-[44px] items-center rounded bg-brand-gradient px-4 font-semibold text-brand-contrast"
          data-test="empty-table-order"
        >
          {{ $t('staff.detail.addOrder') }}
        </NuxtLink>
      </header>
      <TableAssignment :table-no="tableNo" :assignee="assignee" />
    </template>

    <TableAssignment v-if="ticket && tableNo !== null" :table-no="tableNo" :assignee="assignee" />

    <div
      v-if="ticket && !ticketKey.startsWith('w-')"
      class="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-surface px-3 py-2"
    >
      <TableActivity
        :last-order-at="ticket.lastOrderAt"
        :last-check-at="ticket.lastCheckAt"
        :clock-offset-ms="tickets.clockOffsetMs"
      />
      <button
        type="button"
        class="min-h-[44px] rounded-lg border-2 border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
        data-test="table-checked"
        :disabled="checking"
        @click="checked"
      >
        {{ $t('staff.detail.checked') }}
      </button>
    </div>

    <ReadyBanner :kitchen="ready.kitchen" :bar="ready.bar" :busy="serving" :walkin="walkin" @served="served" />

    <p v-if="ticket && ticket.lockedBy" class="mt-3 flex items-center gap-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <UIcon name="i-lucide-lock" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.locked') }}
    </p>

    <ul v-if="ticket" class="mt-4 rounded-lg border border-slate-200 bg-surface p-2">
      <ItemRow
        v-for="item in ticket.items"
        :key="item.orderItemId"
        :walkin="walkin"
        :item="item"
        :can-void="canVoid"
        :can-refund="canRefund"
        :can-void-finished="canVoidFinished"
        @void="openDialog(item, false)"
        @refund="openDialog(item, true)"
      />
    </ul>

    <VoidDialog
      :open="voidTarget !== null"
      :item-name="voidTarget ? `${voidTarget.quantity} × ${itemName(voidTarget)} · ${euro(voidTarget.quantity * voidTarget.unitPriceCents)}` : ''"
      :refund="refundMode"
      :submitting="payments.submitting"
      :error="payments.error"
      :error-code="payments.errorCode"
      @cancel="voidTarget = null"
      @confirm="confirmVoid"
    />
  </main>
</template>
