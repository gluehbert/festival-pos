<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import { tableActivity } from '~/utils/table-activity'
import type { Tile } from '~/utils/table-grid'

interface Props {
  tile: Tile
  mine: boolean
  nowMs: number
  // Under "Meine Tische" every tile is the viewer's: no star, no owner line.
  showOwner?: boolean
}
const props = withDefaults(defineProps<Props>(), { showOwner: true })

const { t } = useI18n()
const { euro } = useFormat()

// Colour plus icon and text: the state must not depend on colour alone. An
// empty table needs no icon (a ring there read like a checkbox).
const STYLE = {
  free: { box: 'border-slate-200 bg-slate-100 text-slate-700', icon: null },
  busy: { box: 'border-amber-400 bg-amber-50 text-amber-900', icon: 'i-lucide-hourglass' },
  pay: { box: 'border-sky-500 bg-sky-50 text-sky-900', icon: 'i-lucide-banknote' },
  ready: { box: 'border-emerald-500 bg-emerald-50 text-emerald-900', icon: 'i-lucide-hand-platter' },
  late: { box: 'border-red-500 bg-red-50 text-red-900', icon: 'i-lucide-bell-ring' },
} as const

const style = computed(() => STYLE[props.tile.state])

const status = computed(() => {
  const ticket = props.tile.ticket
  if (props.tile.state === 'pay' && ticket) return t('staff.grid.state.pay', { n: ticket.foodToPay })
  if (props.tile.state === 'ready' && ticket) return t('staff.grid.state.ready', { n: ticket.ready.kitchen + ticket.ready.bar })
  if (props.tile.state === 'late' && ticket) {
    const { minutes } = tableActivity(ticket.lastOrderAt, ticket.lastCheckAt, props.nowMs)
    return t('staff.grid.state.late', { n: minutes })
  }
  return t(`staff.grid.state.${props.tile.state}`)
})

// Own tables carry a star instead; only someone else's name is spelled out.
const owner = computed(() => (props.showOwner && !props.mine ? props.tile.assignee?.username ?? '' : ''))
</script>

<template>
  <NuxtLink
    :to="`/staff/${tile.tableNo}`"
    class="flex min-h-[96px] w-full flex-col justify-between rounded-xl border-2 p-3 text-left focus:outline-none focus:ring-2 focus:ring-brand"
    :class="style.box"
    :data-state="tile.state"
    :data-mine="mine ? 'true' : undefined"
    data-test="table-tile"
  >
    <div class="flex items-start justify-between gap-1">
      <span class="flex items-center gap-1">
        <span class="text-2xl font-bold tabular-nums"><span class="sr-only">{{ $t('staff.grid.tableWord') }} </span>{{ tile.tableNo }}</span>
        <template v-if="mine && showOwner">
          <UIcon name="i-lucide-star" class="size-4 shrink-0" data-test="tile-mine" aria-hidden="true" />
          <span class="sr-only">{{ $t('staff.assign.mine') }}</span>
        </template>
      </span>
      <UIcon v-if="style.icon" :name="style.icon" class="size-5 shrink-0" aria-hidden="true" />
    </div>
    <p class="text-xs font-semibold">
      {{ status }}<span v-if="tile.ticket && tile.ticket.unpaidCents > 0"> · {{ euro(tile.ticket.unpaidCents) }}</span>
    </p>
    <p v-if="owner" class="flex items-center gap-1 truncate text-xs">
      <UIcon name="i-lucide-user" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ owner }}</span>
    </p>
  </NuxtLink>
</template>
