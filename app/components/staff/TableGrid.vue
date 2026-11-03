<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TableTile from '~/components/staff/TableTile.vue'
import TicketCard from '~/components/staff/TicketCard.vue'
import { buildTiles, isWalkin, matchesOwner, STATE_DOT, type OwnerFilter } from '~/utils/table-grid'
import type { TicketSummary } from '~/../server/lib/contracts/staff'
import type { TableAssignment } from '~/../server/lib/contracts/tables'
import { useBranding } from '~/composables/useBranding'

interface Props {
  tickets: TicketSummary[]
  assignments: TableAssignment[]
  tableRange: { from: number; to: number } | null
  owner: OwnerFilter
  myId?: string
  clockOffsetMs?: number
}
const props = withDefaults(defineProps<Props>(), { myId: undefined, clockOffsetMs: 0 })

// "late" depends on the clock, not only on the poll.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 30_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
const nowMs = computed(() => now.value + props.clockOffsetMs)

const tiles = computed(() => buildTiles(props.tableRange, props.tickets, props.assignments, nowMs.value)
  .filter((tile) => matchesOwner(tile.assignee, props.owner, props.myId)))

// Walk-ins have no table: listed below the grid.
const walkins = computed(() => props.tickets
  .filter((ticket) => isWalkin(ticket) && matchesOwner(ticket.assignee, props.owner, props.myId)))

// "Food to cash" only exists with food prepay.
const { branding } = useBranding()
const LEGEND = computed(() => (['free', 'busy', 'pay', 'ready', 'late'] as const).filter((s) => s !== 'pay' || branding.value.foodPrepayEnabled))
</script>

<template>
  <section class="mt-4" data-test="table-grid">
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" :aria-label="$t('staff.grid.legend')">
      <li v-for="s in LEGEND" :key="s" class="flex items-center gap-1">
        <span class="inline-block size-3 rounded-full" :class="STATE_DOT[s]" aria-hidden="true" />
        {{ $t(`staff.grid.legendState.${s}`) }}
      </li>
      <li v-if="owner !== 'mine'" class="flex items-center gap-1">
        <UIcon name="i-lucide-star" class="size-3 shrink-0" aria-hidden="true" />
        {{ $t('staff.assign.mine') }}
      </li>
    </ul>

    <p v-if="tiles.length === 0" class="mt-4 text-sm text-slate-500">
      {{ $t(owner === 'mine' ? 'staff.grid.noneMine' : 'staff.grid.none') }}
    </p>
    <ul v-else class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      <li v-for="tile in tiles" :key="tile.tableNo">
        <TableTile
          :tile="tile"
          :mine="!!myId && tile.assignee?.staffId === myId"
          :now-ms="nowMs"
          :show-owner="owner !== 'mine'"
        />
      </li>
    </ul>

    <template v-if="walkins.length > 0">
      <h2 class="mt-6 text-sm font-semibold text-slate-700">
        {{ $t('staff.grid.walkins') }}
      </h2>
      <ul class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2" data-test="grid-walkins">
        <li v-for="ticket in walkins" :key="ticket.ticketKey">
          <TicketCard :ticket="ticket" :assignee="ticket.assignee" :mine="!!myId && ticket.assignee?.staffId === myId" :show-owner="owner !== 'mine'" :clock-offset-ms="clockOffsetMs" />
        </li>
      </ul>
    </template>
  </section>
</template>
