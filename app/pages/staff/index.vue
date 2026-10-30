<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useTicketsStore } from '~/stores/tickets'
import { usePolling } from '~/composables/usePolling'
import TicketCard from '~/components/staff/TicketCard.vue'
import LastReceipt from '~/components/staff/LastReceipt.vue'
import StaleBanner from '~/components/common/StaleBanner.vue'
import { useAttention } from '~/composables/useAttention'
import { createIncreaseTracker } from '~/utils/arrivals'
import OverviewControls from '~/components/staff/OverviewControls.vue'
import TableGrid from '~/components/staff/TableGrid.vue'
import { useStaffView, type OverviewView } from '~/composables/useStaffView'
import { useDeviceMode } from '~/composables/useDeviceMode'
import ServiceActions from '~/components/staff/ServiceActions.vue'
import { useBranding } from '~/composables/useBranding'
import NeedsSomeone from '~/components/staff/NeedsSomeone.vue'
import WaiterCalls from '~/components/staff/WaiterCalls.vue'
import WelcomeCard from '~/components/staff/WelcomeCard.vue'
import { useWelcome } from '~/composables/useWelcome'
import { matchesOwner, needsSomeone, ticketAssignee, type OwnerFilter } from '~/utils/table-grid'

const auth = useAuthStore()
const tickets = useTicketsStore()
// Open tables are the normal case; paid ones are one tap away for reprints.
const filter = ref<'open' | 'paid'>('open')
const staffView = useStaffView()
const { owner } = staffView
// Waiters see the table grid only; the list (and paid tables for reprints)
// and the tables nobody looks after are for the shift lead and admin.
const expert = computed(() => auth.hasRole(['lead', 'admin']))
const view = computed<OverviewView>(() => (expert.value ? staffView.view.value : 'grid'))
// The grid shows what is going on now: always the open tables.
const status = computed(() => (view.value === 'grid' ? 'open' : filter.value))
const myId = computed(() => auth.staff?.staffId)

// Outside the poller a failed load only shows the warning; the poller retries.
function loadQuietly() {
  return tickets.refresh({ status: status.value }).catch(() => {})
}

// More finished items, or new food to cash, at a table: tone + vibration.
const attention = useAttention()
const ready = createIncreaseTracker()
watch(() => tickets.lastSyncAt, () => {
  const counts = new Map(tickets.tickets.map((t) => [t.ticketKey, t.ready.kitchen + t.ready.bar + t.foodToPay]))
  if (ready.update(counts).length > 0) attention.notify()
})

const { mode: deviceMode, restore: restoreDevice } = useDeviceMode()
const welcome = useWelcome()
function closeWelcome() {
  if (myId.value) welcome.dismiss(myId.value)
}
// Pfand and helper meals are switched per event.
const { branding } = useBranding()

onMounted(async () => {
  restoreDevice()
  if (!auth.isAuthenticated) {
    const me = await auth.refresh()
    if (!me) {
      await navigateTo('/staff/login')
      return
    }
  }
  // A waiter starts with the tables the shift lead gave them.
  staffView.restore(auth.hasRole('waiter') ? 'mine' : 'all')
  if (auth.staff && auth.hasRole(['waiter', 'lead'])) welcome.restore(auth.staff.staffId)
  await loadQuietly()
})

const polling = usePolling(
  () => tickets.refresh({ status: status.value }),
  { intervalMs: 4000, immediate: false, maxBackoffMs: 30_000 },
)

async function reload() {
  polling.stop()
  ready.reset()
  await loadQuietly()
  polling.start()
}

function toggleFilter() {
  filter.value = filter.value === 'open' ? 'paid' : 'open'
  return reload()
}

function setView(v: OverviewView) {
  const before = status.value
  staffView.setView(v)
  if (status.value !== before) return reload()
}

const assigneeOf = (t: (typeof tickets.tickets)[number]) => ticketAssignee(t, tickets.assignments)
const filtered = computed(() => tickets.tickets.filter((t) => matchesOwner(assigneeOf(t), owner.value, myId.value)))
// Under "Alle" these tables are in the list/grid anyway.
const unattended = computed(() => (expert.value && owner.value === 'mine' ? needsSomeone(tickets.tickets, tickets.assignments) : []))
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <WelcomeCard v-if="welcome.open.value" @close="closeWelcome" />

    <ServiceActions :mode="deviceMode" :deposit="branding.depositEnabled" :staff-meals="branding.staffMealsEnabled" />

    <NuxtLink
      v-if="expert"
      to="/staff/tables"
      class="mt-2 flex min-h-[48px] items-center justify-center gap-2 rounded-lg border-2 border-slate-300 bg-surface px-3 font-semibold text-slate-900"
      data-test="distribute-link"
    >
      <UIcon name="i-lucide-users" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t('staff.distribute.nav') }}
    </NuxtLink>

    <StaleBanner :failed="tickets.syncFailed" :since="tickets.lastSyncAt" @retry="polling.refresh()" />

    <WaiterCalls v-if="branding.waiterCallsEnabled" />

    <!-- A table paid in full lands here: its receipt can still be printed. -->
    <LastReceipt />

    <div class="mt-6 flex items-baseline justify-between gap-2">
      <h1 class="text-2xl font-bold text-slate-900">
        {{ $t(`staff.overview.heading.${view === 'grid' ? 'tables' : status}`) }}
      </h1>
      <button
        v-if="view === 'list'"
        type="button"
        class="min-h-[44px] text-sm text-slate-600 underline"
        data-test="paid-toggle"
        @click="toggleFilter"
      >
        {{ $t(`staff.overview.show.${filter === 'open' ? 'paid' : 'open'}`) }}
      </button>
    </div>

    <OverviewControls :owner="owner" :view="view" :show-view="expert" @owner="(o: OwnerFilter) => staffView.setOwner(o)" @view="setView" />

    <NeedsSomeone :tickets="unattended" />

    <TableGrid
      v-if="view === 'grid'"
      :tickets="tickets.tickets"
      :assignments="tickets.assignments"
      :table-range="tickets.tableRange"
      :owner="owner"
      :my-id="myId"
      :clock-offset-ms="tickets.clockOffsetMs"
    />

    <template v-else>
    <p v-if="tickets.loading && filtered.length === 0" class="mt-6 text-sm text-slate-500">
      {{ $t('staff.overview.loading') }}
    </p>
    <p v-else-if="filtered.length === 0" class="mt-6 text-sm text-slate-500">
      {{ $t('staff.overview.empty') }}
    </p>

    <ul v-else class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <li v-for="t in filtered" :key="t.ticketKey">
        <TicketCard
          :ticket="t"
          :assignee="assigneeOf(t)"
          :mine="!!myId && assigneeOf(t)?.staffId === myId"
          :show-owner="owner !== 'mine'"
          :clock-offset-ms="tickets.clockOffsetMs"
        />
      </li>
    </ul>
    </template>
  </main>
</template>
