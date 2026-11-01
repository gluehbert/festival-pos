<script setup lang="ts">
import ReadyBadges from '~/components/staff/ReadyBadges.vue'
import type { TicketSummary } from '~/../server/lib/contracts/staff'
import type { TableAssignment } from '~/../server/lib/contracts/tables'
import { ticketAssignee } from '~/utils/table-grid'

// Finished trays of other waiters' tables, above "Meine Tische": whoever is at
// the counter brings them and may cash there, or taps "Gebracht".
const props = defineProps<{ tickets: TicketSummary[]; assignments: TableAssignment[] }>()

const ownerName = (t: TicketSummary) => ticketAssignee(t, props.assignments)?.username ?? null
</script>

<template>
  <section
    v-if="tickets.length > 0"
    class="mt-4 rounded-lg border border-emerald-500 bg-emerald-50 p-3 text-emerald-950"
    data-test="ready-elsewhere"
  >
    <h2 class="flex items-center gap-1 text-sm font-semibold">
      <UIcon name="i-lucide-hand-platter" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('staff.readyElsewhere.heading') }}
    </h2>
    <p class="mt-1 text-xs">
      {{ $t('staff.readyElsewhere.hint') }}
    </p>
    <ul class="mt-2 space-y-2">
      <li v-for="t in tickets" :key="t.ticketKey">
        <NuxtLink
          :to="`/staff/${t.tableNo}`"
          class="flex min-h-[48px] flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-emerald-500 bg-surface px-3 py-2"
          data-test="ready-elsewhere-table"
        >
          <span class="text-base font-bold">{{ $t('staff.detail.table', { n: t.tableNo }) }}</span>
          <ReadyBadges :ready="t.ready" />
          <span class="text-xs text-slate-600">{{ ownerName(t) ?? $t('staff.calls.nobody') }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
