<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'
import { useFormat } from '~/composables/useFormat'
import { useBuzzer } from '~/composables/useBuzzer'
import type { ProductionOrderGroup } from '~/stores/production'
import type { ProductionLane } from '~/../server/lib/contracts/production'
import NoteBadge from '~/components/common/NoteBadge.vue'
import { ageClass, cardLines, groupLabel, isFollowUp, minutesWaiting } from '~/utils/production-card'
import { fitText } from '~/utils/fit-text'

// Kitchen/bar screen with buzzers: each buzzer has a lane (1 green, 2 blue)
// holding the card its person works on, big enough to read from afar. The
// rest waits on the right under "Next up"; a tap finishes any card, the
// lanes stay put.
// On a tablet or TV the view fills the screen exactly: nobody scrolls.
const props = defineProps<{ groups: ProductionOrderGroup[]; lanes: ProductionLane[]; finishing: Set<string> }>()
const emit = defineEmits<{ (e: 'finish', group: ProductionOrderGroup, named: boolean): void }>()

const { t } = useI18n()
const { itemName } = useFormat()

const COLORS: Record<number, { border: string; bg: string; text: string }> = {
  1: { border: 'border-emerald-600', bg: 'bg-emerald-600', text: 'text-emerald-700' },
  2: { border: 'border-blue-600', bg: 'bg-blue-600', text: 'text-blue-700' },
}
// Lines a waiting card shows before "+n more".
const PREVIEW_LINES = 3

const laneCards = computed(() => props.lanes.map((l) => {
  const group = props.groups.find((g) => g.key === l.groupKey) ?? null
  return { ...l, group, lines: group ? cardLines(group.items, l.assignedAt) : [] }
}))
const waiting = computed(() => props.groups.filter((g) => !props.lanes.some((l) => l.groupKey === g.key)))
const single = computed(() => props.lanes.length === 1)

function press(lane: number) {
  const group = laneCards.value.find((l) => l.lane === lane)?.group
  if (group && !props.finishing.has(group.key)) emit('finish', group, true)
}
useBuzzer(computed(() => props.lanes.find((l) => l.lane === 1)?.key ?? null), () => press(1))
useBuzzer(computed(() => props.lanes.find((l) => l.lane === 2)?.key ?? null), () => press(2))

// From tablet width on, the view takes the height left below its top edge,
// and each lane's type shrinks until its whole order fits.
const root = ref<HTMLElement | null>(null)
const lists = new Map<number, HTMLElement>()
const height = ref<number | null>(null)
// Lanes whose order does not fit even in the smallest type: they say so,
// a buzzer must not finish what nobody could see.
const cut = ref<number[]>([])
function layout() {
  const el = root.value
  if (!el) return
  // The display menu zooms the page; browsers differ in whether element
  // positions come zoomed, so the page's own width tells the scale.
  const html = document.documentElement
  const zoom = Number.parseFloat(html.style.zoom || '1') || 1
  const scale = html.getBoundingClientRect().width / (html.offsetWidth || 1) || 1
  const next = window.innerWidth / zoom >= 768
    ? Math.max(320, Math.floor(window.innerHeight / zoom - el.getBoundingClientRect().top / scale - 16))
    : null
  if (next !== height.value) height.value = next
  void nextTick(() => {
    const now = [...lists].filter(([, list]) => !fitText(list)).map(([lane]) => lane).sort()
    if (now.join() !== cut.value.join()) cut.value = now
  })
}
onMounted(() => {
  layout()
  window.addEventListener('resize', layout)
})
onUpdated(layout)
onBeforeUnmount(() => window.removeEventListener('resize', layout))
</script>

<template>
  <div
    ref="root"
    class="mt-2 flex flex-col gap-3 md:flex-row"
    :style="height ? { height: `${height}px` } : undefined"
  >
    <div class="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3" :class="single ? '' : 'md:grid-cols-2'">
      <section
        v-for="l in laneCards"
        :key="l.lane"
        :data-test="`lane-${l.lane}`"
        class="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border-[6px] bg-surface md:min-h-0"
        :class="COLORS[l.lane]!.border"
      >
        <header class="flex shrink-0 items-center justify-between gap-2 px-4 py-1.5 text-white" :class="COLORS[l.lane]!.bg">
          <span class="flex min-w-0 items-center gap-2 truncate text-lg font-extrabold uppercase tracking-wide">
            <span class="flex size-8 items-center justify-center rounded-full bg-white text-lg font-black" :class="COLORS[l.lane]!.text">{{ l.lane }}</span>
            {{ $t(`production.lanes.buzzer${l.lane}`) }}
          </span>
          <span v-if="l.group" class="shrink-0 whitespace-nowrap rounded-full px-3 py-0.5 text-base font-semibold" :class="ageClass(minutesWaiting(l.group))">
            {{ $t('production.waiting', { n: minutesWaiting(l.group) }) }}
          </span>
        </header>
        <div v-if="l.group" class="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2">
          <p class="shrink-0">
            <span class="inline-block rounded-lg bg-slate-900 px-3 py-0.5 text-3xl font-black text-white" data-test="lane-label">{{ groupLabel(l.group, t) }}</span>
            <span v-if="isFollowUp(l.group, groups)" class="ml-2 rounded-md bg-slate-200 px-2 py-1 align-middle text-lg font-bold text-slate-800" data-test="follow-up">{{ $t('production.lanes.followUp') }}</span>
          </p>
          <ul :ref="(el) => el ? lists.set(l.lane, el as HTMLElement) : lists.delete(l.lane)" class="mt-1 min-h-0 flex-1 gap-6 overflow-hidden text-4xl" data-test="lane-lines">
            <li
              v-for="line in l.lines"
              :key="line.key"
              class="break-inside-avoid border-t border-slate-100 py-1 font-extrabold leading-tight text-slate-900 first:border-0"
              :class="line.isNew ? 'rounded-lg bg-amber-100 px-2' : ''"
              :data-test="line.isNew ? 'lane-line-new' : 'lane-line'"
            >
              <span v-if="line.isNew" class="mr-2 rounded bg-amber-500 px-2 py-0.5 align-middle text-base font-black uppercase text-white">{{ $t('production.lanes.new') }}</span>
              {{ line.quantity }} × {{ itemName(line.first) }}
              <div><NoteBadge :note="line.first.note" large /></div>
            </li>
          </ul>
          <p v-if="cut.includes(l.lane)" class="mt-1 shrink-0 rounded-lg bg-rose-600 px-3 py-1 text-base font-bold text-white" role="alert" data-test="lane-cut">
            {{ $t('production.lanes.cut') }}
          </p>
          <button
            type="button"
            class="mt-2 min-h-[52px] w-full shrink-0 rounded-lg border-2 border-success text-lg font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
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

    <section v-if="waiting.length > 0" class="flex min-h-0 shrink-0 flex-col md:w-[clamp(12rem,22%,22rem)]">
      <h2 class="mb-1 text-base font-semibold text-slate-600">
        {{ $t('production.lanes.next', { n: waiting.length }) }}
      </h2>
      <ul class="grid min-h-0 grid-cols-1 content-start gap-2 overflow-y-auto" data-test="lane-queue">
        <li v-for="g in waiting" :key="g.key" class="flex flex-col rounded-xl border-2 border-slate-200 bg-surface p-2.5" data-test="lane-queue-card">
          <div class="flex items-start justify-between gap-2">
            <span class="text-lg font-black leading-tight text-slate-900">
              {{ groupLabel(g, t) }}
              <span v-if="isFollowUp(g, groups)" class="ml-1 rounded bg-slate-200 px-1.5 py-0.5 align-middle text-xs font-bold text-slate-800" data-test="follow-up">{{ $t('production.lanes.followUp') }}</span>
            </span>
            <span class="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-semibold" :class="ageClass(minutesWaiting(g))">
              {{ $t('production.lanes.minutes', { n: minutesWaiting(g) }) }}
            </span>
          </div>
          <ul class="mt-1 flex-1">
            <li v-for="line in cardLines(g.items).slice(0, PREVIEW_LINES)" :key="line.key" class="text-base font-semibold leading-snug text-slate-800">
              {{ line.quantity }} × {{ itemName(line.first) }}
              <NoteBadge :note="line.first.note" />
            </li>
            <li v-if="cardLines(g.items).length > PREVIEW_LINES" class="text-sm font-semibold text-slate-500">
              {{ $t('production.lanes.more', { n: cardLines(g.items).length - PREVIEW_LINES }) }}
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
