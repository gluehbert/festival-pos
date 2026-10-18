<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useTicketsStore } from '~/stores/tickets'
import { usePaymentsStore } from '~/stores/payments'
import { useFormat } from '~/composables/useFormat'
import PayGroupRow from '~/components/staff/PayGroupRow.vue'
import PaymentSummary from '~/components/staff/PaymentSummary.vue'
import LastReceipt from '~/components/staff/LastReceipt.vue'
import PaymentDone from '~/components/staff/PaymentDone.vue'
import { buildPayRequest, groupOpenItems, lockMessageKey, lockSecondsLeft, selectionCents } from '~/composables/usePaySelection'

const { t } = useI18n()
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

// Chosen count per article group: what this guest pays now.
const counts = ref<Record<string, number>>({})
const successMessage = ref<string | null>(null)
// Set once the ticket is fully paid: the page shows the result instead of
// leaving at once, so the change and the receipt are still at hand.
const done = ref<{ amountCents: number; changeCents: number | null } | null>(null)
const rejected = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

// Most tables pay together: everything open starts selected, and
// "Getrennt zahlen" clears it for one guest's share.
function everything(): Record<string, number> {
  return Object.fromEntries(groups.value.map((g) => [g.key, g.openQuantity]))
}

async function load() {
  // Fresh ticket, fresh selection: the next payment gets a new key.
  payments.forgetPending()
  await tickets.load(ticketKey.value)
  counts.value = everything()
}

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

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

const ticket = computed(() => tickets.selected)
const groups = computed(() => groupOpenItems(ticket.value?.items ?? []))
const paidItems = computed(() => (ticket.value?.items ?? []).filter((i) => i.paymentStatus === 'paid' && i.productionStatus !== 'cancelled'))
const selectedCents = computed(() => selectionCents(groups.value, counts.value))
const selectedUnits = computed(() => groups.value.reduce((n, g) => n + Math.min(counts.value[g.key] ?? 0, g.openQuantity), 0))
const allSelected = computed(() => groups.value.length > 0 && groups.value.every((g) => counts.value[g.key] === g.openQuantity))

function setCount(key: string, n: number) {
  counts.value = { ...counts.value, [key]: n }
}

function selectAll() {
  counts.value = allSelected.value ? {} : everything()
}

function startCountdown(expiresAt: string) {
  if (countdownTimer) clearInterval(countdownTimer)
  const tick = () => {
    countdown.value = lockSecondsLeft(expiresAt)
    if (countdown.value <= 0) {
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = null
      payments.lockConflict = null
    }
  }
  countdownTimer = setInterval(tick, 1000)
  tick()
}

function changeFor(givenCents: number | null, amountCents: number): number | null {
  return givenCents !== null && givenCents >= amountCents ? givenCents - amountCents : null
}

async function submit(givenCents: number | null = null) {
  if (!ticket.value || selectedUnits.value <= 0) return
  rejected.value = false
  const req = buildPayRequest(groups.value, counts.value)
  successMessage.value = null
  const res = await payments.createPayment(ticket.value.ticketKey, req.orderItemIds, req.quantities)
  if (res) {
    const changeCents = changeFor(givenCents, res.totalCents)
    if (res.ticketStatusAfter === 'paid') {
      done.value = { amountCents: res.totalCents, changeCents }
      return
    }
    successMessage.value = changeCents === null
      ? t('staff.pay.success', { amount: euro(res.totalCents) })
      : t('staff.pay.successChange', { amount: euro(res.totalCents), change: euro(changeCents) })
    await load()
  }
  else if (payments.lockConflict) {
    startCountdown(payments.lockConflict.expiresAt)
  }
  else if (!payments.unconfirmed) {
    // The server said no (e.g. paid meanwhile by someone else): show what
    // is really open. After no answer the selection stays for the retry.
    rejected.value = true
    await load()
  }
}
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 py-6">
    <NuxtLink :to="`/staff/${tableParam}`" class="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded px-2 text-sm text-slate-500 hover:bg-slate-100">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.pay.back') }}
    </NuxtLink>
    <h1 class="mt-2 text-2xl font-bold text-slate-900">
      {{ $t('staff.pay.title') }}
    </h1>

    <PaymentDone v-if="done" :amount-cents="done.amountCents" :change-cents="done.changeCents" />

    <template v-else>
      <div
        v-if="payments.lockConflict"
        class="mt-3 flex items-center gap-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800"
        role="status"
      >
        <UIcon name="i-lucide-lock" class="size-4 shrink-0" aria-hidden="true" /> {{ $t(lockMessageKey(payments.lockConflict.lockedBy, auth.staff?.staffId), { user: payments.lockConflict.lockedBy }) }}
        <span v-if="countdown > 0"> · {{ countdown }} s</span>
      </div>

      <p
        v-if="payments.unconfirmed"
        class="mt-3 flex items-center gap-2 rounded bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800"
        role="alert"
      >
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.pay.unconfirmed') }}
      </p>
      <p
        v-else-if="rejected"
        class="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-800"
        role="alert"
      >
        {{ $t('staff.pay.rejected') }}
      </p>

      <p v-if="successMessage" class="mt-3 flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
        <UIcon name="i-lucide-circle-check" class="size-4 shrink-0" aria-hidden="true" /> {{ successMessage }}
      </p>
      <LastReceipt v-if="successMessage" />

      <div v-if="groups.length > 0" class="mt-4 flex items-center justify-between">
        <p class="text-sm text-slate-600">
          {{ allSelected ? $t('staff.pay.hintAll') : $t('staff.pay.hint') }}
        </p>
        <button
          type="button"
          class="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm font-semibold"
          @click="selectAll"
        >
          {{ allSelected ? $t('staff.pay.selectNone') : $t('staff.pay.selectAll') }}
        </button>
      </div>
      <ul v-if="groups.length > 0" class="mt-2 rounded-lg border border-slate-200 bg-surface px-2">
        <PayGroupRow
          v-for="g in groups"
          :key="g.key"
          :group="g"
          :count="counts[g.key] ?? 0"
          @update="(n) => setCount(g.key, n)"
        />
      </ul>
      <p v-else-if="ticket" class="mt-4 text-sm text-slate-500">
        {{ $t('staff.pay.nothingOpen') }}
      </p>

      <div class="mt-4">
        <PaymentSummary
          :selected-cents="selectedCents"
          :selected-units="selectedUnits"
          :total-cents="ticket?.unpaidCents ?? 0"
          :submitting="payments.submitting"
          :sending="payments.sending"
          :disabled="payments.lockConflict !== null"
          @submit="submit"
          @cancel-sending="payments.cancelSending"
        />
      </div>

      <details v-if="paidItems.length > 0" class="mt-4 text-sm text-slate-600">
        <summary>{{ $t('staff.pay.alreadyPaid', { n: paidItems.length }) }}</summary>
        <ul class="mt-1 space-y-1 pl-4">
          <li v-for="i in paidItems" :key="i.orderItemId">
            {{ i.quantity }} × {{ itemName(i) }} · {{ euro(i.quantity * (i.unitPriceCents + i.depositCents)) }}
          </li>
        </ul>
      </details>
    </template>
  </main>
</template>
