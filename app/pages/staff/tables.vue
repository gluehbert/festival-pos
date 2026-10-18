<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useTicketsStore } from '~/stores/tickets'
import { useApi } from '~/composables/useApi'
import { usePolling } from '~/composables/usePolling'
import StaleBanner from '~/components/common/StaleBanner.vue'
import type { Assignee, Team } from '~/../server/lib/contracts/tables'

// "Tische verteilen": at the start of a shift the lead picks a person, then
// taps that person's tables. Every tap is saved at once; tapping one of the
// picked person's tables again frees it.
const auth = useAuthStore()
const tickets = useTicketsStore()
const team = ref<Assignee[]>([])
const loaded = ref(false)
const person = ref<string | null>(null)
const busy = ref<number[]>([])
const failed = ref<number | null>(null)

const picked = computed(() => team.value.find((m) => m.staffId === person.value) ?? null)
const holderOf = (tableNo: number) => tickets.assignments.find((a) => a.tableNo === tableNo) ?? null
const countOf = (staffId: string) => tickets.assignments.filter((a) => a.staffId === staffId).length

// The event's table range, plus tables outside it that someone already holds.
const tables = computed(() => {
  const range = tickets.tableRange
  const nos = new Set(tickets.assignments.map((a) => a.tableNo))
  if (range) for (let n = range.from; n <= range.to; n++) nos.add(n)
  return [...nos].sort((a, b) => a - b)
})

const polling = usePolling(
  () => tickets.refresh({ status: 'open' }),
  { intervalMs: 4000, immediate: false, maxBackoffMs: 30_000 },
)

onMounted(async () => {
  if (!auth.isAuthenticated && !(await auth.refresh())) {
    await navigateTo('/staff/login')
    return
  }
  if (!auth.hasRole(['lead', 'admin'])) {
    await navigateTo('/staff')
    return
  }
  await Promise.all([
    useApi().get<Team>('/api/tickets/team').then((r) => { team.value = r.team }).catch(() => {}),
    tickets.refresh({ status: 'open' }).catch(() => {}),
  ])
  loaded.value = true
})

async function tap(tableNo: number) {
  const staffId = person.value
  if (!staffId || busy.value.includes(tableNo)) return
  busy.value = [...busy.value, tableNo]
  failed.value = null
  const ok = holderOf(tableNo)?.staffId === staffId
    ? await tickets.release(tableNo)
    : (await tickets.assign(tableNo, true, staffId)).ok
  if (!ok) failed.value = tableNo
  busy.value = busy.value.filter((n) => n !== tableNo)
}

function tileClass(tableNo: number): string {
  const holder = holderOf(tableNo)
  if (!holder) return 'border-dashed border-slate-300 bg-surface text-slate-500'
  if (holder.staffId === person.value) return 'border-primary bg-primary text-white'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <NuxtLink to="/staff" class="inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.back') }}
    </NuxtLink>
    <h1 class="mt-2 text-2xl font-bold text-slate-900">
      {{ $t('staff.distribute.title') }}
    </h1>
    <StaleBanner :failed="tickets.syncFailed" :since="tickets.lastSyncAt" @retry="polling.refresh()" />

    <h2 class="mt-4 text-base font-semibold text-slate-900">
      {{ $t('staff.distribute.pickPerson') }}
    </h2>
    <p v-if="loaded && team.length === 0" class="mt-2 text-sm text-slate-600" data-test="distribute-no-team">
      {{ $t('staff.distribute.noTeam') }}
    </p>
    <ul v-else class="mt-2 flex flex-wrap gap-2" data-test="distribute-team">
      <li v-for="m in team" :key="m.staffId">
        <button
          type="button"
          class="flex min-h-[52px] flex-col items-start justify-center rounded-lg border-2 px-4 text-left"
          :class="person === m.staffId ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-surface text-slate-900'"
          :aria-pressed="person === m.staffId"
          data-test="distribute-person"
          @click="person = m.staffId"
        >
          <span class="font-semibold">{{ m.username }}</span>
          <span class="text-xs">{{ $t('staff.distribute.count', { n: countOf(m.staffId) }, countOf(m.staffId)) }}</span>
        </button>
      </li>
    </ul>

    <h2 class="mt-6 text-base font-semibold text-slate-900">
      {{ $t('staff.distribute.pickTables') }}
    </h2>
    <p class="mt-1 text-sm" :class="picked ? 'text-slate-600' : 'font-semibold text-amber-800'" role="status" data-test="distribute-hint">
      {{ picked ? $t('staff.distribute.tapHint', { name: picked.username }) : $t('staff.distribute.pickFirst') }}
    </p>
    <p v-if="failed !== null" class="mt-2 text-sm text-red-700" role="alert">
      {{ $t('staff.distribute.failed', { n: failed }) }}
    </p>
    <p v-if="loaded && tables.length === 0" class="mt-3 text-sm text-slate-600">
      {{ $t('staff.distribute.noTables') }}
    </p>
    <ul v-else class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      <li v-for="n in tables" :key="n">
        <button
          type="button"
          class="flex min-h-[72px] w-full flex-col justify-between rounded-xl border-2 p-2 text-left disabled:opacity-60"
          :class="tileClass(n)"
          :disabled="!picked || busy.includes(n)"
          :aria-pressed="holderOf(n)?.staffId === person"
          data-test="distribute-table"
          @click="tap(n)"
        >
          <span class="text-2xl font-bold tabular-nums">{{ n }}</span>
          <span class="truncate text-xs">{{ holderOf(n)?.username ?? $t('staff.distribute.free') }}</span>
        </button>
      </li>
    </ul>
  </main>
</template>
