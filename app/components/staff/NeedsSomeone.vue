<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { TicketSummary } from '~/../server/lib/contracts/staff'

// Open tables without a waiter, shown above "Meine Tische" so a guest order at
// a table nobody took is not missed.
defineProps<{ tickets: TicketSummary[] }>()

const { euro } = useFormat()
</script>

<template>
  <section
    v-if="tickets.length > 0"
    class="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900"
    data-test="needs-someone"
  >
    <h2 class="flex items-center gap-1 text-sm font-semibold">
      <UIcon name="i-lucide-user-round-search" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('staff.needsSomeone.heading') }}
    </h2>
    <p class="mt-1 text-xs">
      {{ $t('staff.needsSomeone.hint') }}
    </p>
    <ul class="mt-2 flex flex-wrap gap-2">
      <li v-for="t in tickets" :key="t.ticketKey">
        <NuxtLink
          :to="`/staff/${t.tableNo}`"
          class="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-amber-400 bg-surface px-3 text-sm font-semibold"
        >
          {{ $t('staff.detail.table', { n: t.tableNo }) }}
          <span class="font-normal">· {{ euro(t.unpaidCents) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
