<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import { useBuzzer } from '~/composables/useBuzzer'
import type { ProductionOrderGroup } from '~/stores/production'
import type { ProductionLane } from '~/../server/lib/contracts/production'
import NoteBadge from '~/components/common/NoteBadge.vue'
import { ageClass, cardLines, groupLabel, isFollowUp, minutesWaiting } from '~/utils/production-card'

// Kitchen/bar screen with buzzers: each buzzer has a lane (1 green, 2 blue)
// holding the card its person works on, big enough to read from afar. The
// rest waits below in order; a tap finishes any card, the lanes stay put.
const props = defineProps<{ groups: ProductionOrderGroup[]; lanes: ProductionLane[]; finishing: Set<string> }>()
const emit = defineEmits<{ (e: 'finish', group: ProductionOrderGroup, named: boolean): void }>()

const { t } = useI18n()
const { itemName } = useFormat()

const COLORS: Record<number, { border: string; bg: string; text: string }> = {
  1: { border: 'border-emerald-600', bg: 'bg-emerald-600', text: 'text-emerald-700' },
  2: { border: 'border-blue-600', bg: 'bg-blue-600', text: 'text-blue-700' },
}

// Long orders get a smaller type so the "done" button stays on screen.
const sizeFor = (lines: number) => (lines <= 4 ? 'text-4xl' : lines <= 7 ? 'text-3xl' : 'text-2xl')

const laneCards = computed(() => props.lanes.map((l) => {
  const group = props.groups.find((g) => g.key === l.groupKey) ?? null
  const lines = group ? cardLines(group.items, l.assignedAt) : []
  return { ...l, group, lines, size: sizeFor(lines.length) }
}))
const waiting = computed(() => props.groups.filter((g) => !props.lanes.some((l) => l.groupKey === g.key)))

function press(lane: number) {
  const group = laneCards.value.find((l) => l.lane === lane)?.group
  if (group && !props.finishing.has(group.key)) emit('finish', group, true)
}
useBuzzer(computed(() => props.lanes.find((l) => l.lane === 1)?.key ?? null), () => press(1))
useBuzzer(computed(() => props.lanes.find((l) => l.lane === 2)?.key ?? null), () => press(2))
</script>

<template>
  <div class="mt-6 gap-5" :class="lanes.length === 1 ? 'lg:grid lg:grid-cols-[3fr_2fr] lg:items-start' : ''">
    <div class="grid grid-cols-1 gap-5" :class="lanes.length > 1 ? 'md:grid-cols-2' : ''">
      <section
        v-for="l in laneCards"
        :key="l.lane"
        :data-test="`lane-${l.lane}`"
        class="flex min-h-[360px] flex-col overflow-hidden rounded-2xl border-[6px] bg-surface"
        :class="COLORS[l.lane]!.border"
      >
        <header class="flex items-center justify-between gap-2 px-4 py-2 text-white" :class="COLORS[l.lane]!.bg">
          <span class="flex items-center gap-2 text-lg font-extrabold uppercase tracking-wide">
            <span class="flex size-9 items-center justify-center rounded-full bg-white text-xl font-black" :class="COLORS[l.lane]!.text">{{ l.lane }}</span>
            {{ $t(`production.lanes.buzzer${l.lane}`) }}
          </span>
          <span v-if="l.group" class="rounded-full px-3 py-1 text-base font-semibold" :class="ageClass(minutesWaiting(l.group))">
            {{ $t('production.waiting', { n: minutesWaiting(l.group) }) }}
          </span>
        </header>
        <div v-if="l.group" class="flex flex-1 flex-col p-4">
          <p>
            <span class="inline-block rounded-lg bg-slate-900 px-3 py-1 text-3xl font-black text-white" data-test="lane-label">{{ groupLabel(l.group, t) }}</span>
            <span v-if="isFollowUp(l.group, groups)" class="ml-2 rounded-md bg-slate-200 px-2 py-1 align-middle text-lg font-bold text-slate-800" data-test="follow-up">{{ $t('production.lanes.followUp') }}</span>
          </p>
          <ul class="mt-2 flex-1 divide-y divide-slate-100">
            <li
              v-for="line in l.lines"
              :key="line.key"
              class="py-1.5 font-extrabold leading-tight text-slate-900"
              :class="[l.size, line.isNew ? '-mx-2 rounded-lg bg-amber-100 px-2' : '']"
              :data-test="line.isNew ? 'lane-line-new' : 'lane-line'"
            >
              <span v-if="line.isNew" class="mr-2 rounded bg-amber-500 px-2 py-0.5 align-middle text-base font-black uppercase text-white">{{ $t('production.lanes.new') }}</span>
              {{ line.quantity }} × {{ itemName(line.first) }}
              <div><NoteBadge :note="line.first.note" large /></div>
            </li>
          </ul>
          <button
            type="button"
            class="mt-3 min-h-[56px] w-full rounded-lg border-2 border-success text-lg font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            :disabled="finishing.has(l.group.key)"
            @click="emit('finish', l.group, false)"
          >
            {{ finishing.has(l.group.key) ? '…' : $t('production.finishOrder', { label: groupLabel(l.group, t) }) }}
          </button>
        </div>
        <p v-else class="flex flex-1 items-center justify-center p-6 text-center text-xl text-slate-500">
          {{ $t('production.lanes.free') }}
        </p>
      </section>
    </div>

    <section v-if="waiting.length > 0" class="mt-5 lg:mt-0" :class="lanes.length > 1 ? 'lg:mt-5' : ''">
      <h2 class="mb-2 text-lg font-semibold text-slate-600">
        {{ $t('production.lanes.next', { n: waiting.length }) }}
      </h2>
      <ul class="grid grid-cols-1 gap-3" :class="lanes.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-4' : ''">
        <li v-for="g in waiting" :key="g.key" class="flex flex-col rounded-xl border-2 border-slate-200 bg-surface p-3" data-test="lane-queue-card">
          <div class="flex items-start justify-between gap-2">
            <span class="text-xl font-black text-slate-900">
              {{ groupLabel(g, t) }}
              <span v-if="isFollowUp(g, groups)" class="ml-1 rounded bg-slate-200 px-1.5 py-0.5 align-middle text-xs font-bold text-slate-800" data-test="follow-up">{{ $t('production.lanes.followUp') }}</span>
            </span>
            <span class="shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold" :class="ageClass(minutesWaiting(g))">
              {{ $t('production.waiting', { n: minutesWaiting(g) }) }}
            </span>
          </div>
          <ul class="mt-1 flex-1">
            <li v-for="line in cardLines(g.items)" :key="line.key" class="text-lg font-semibold text-slate-800">
              {{ line.quantity }} × {{ itemName(line.first) }}
              <NoteBadge :note="line.first.note" />
            </li>
          </ul>
          <button
            type="button"
            class="mt-2 min-h-[44px] w-full rounded-lg border-2 border-success font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            :disabled="finishing.has(g.key)"
            :aria-label="$t('production.toastDoneFor', { label: groupLabel(g, t) })"
            @click="emit('finish', g, false)"
          >
            {{ finishing.has(g.key) ? '…' : $t('production.done') }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
