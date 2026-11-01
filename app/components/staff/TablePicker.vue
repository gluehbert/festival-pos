<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { STATE_DOT, type Tile } from '~/utils/table-grid'

// A new table order starts here: one tap on a table instead of typing its
// number. A waiter with tables of their own sees those first, "All" shows
// every table. "Other no." still takes a typed number (tables outside the
// event's range, or when the tables could not be loaded).
const props = defineProps<{ tiles: Tile[]; myId?: string; current: number | null }>()
const emit = defineEmits<{ pick: [tableNo: number]; keep: [] }>()

const { t } = useI18n()

const isMine = (tile: Tile) => !!props.myId && tile.assignee?.staffId === props.myId
const mine = computed(() => props.tiles.filter(isMine))
const showAll = ref(false)
const shown = computed(() => (mine.value.length > 0 && !showAll.value ? mine.value : props.tiles))

const input = useTemplateRef<HTMLInputElement>('input')
const typing = ref(false)
const typed = ref('')
const typedNo = computed(() => Number.parseInt(typed.value, 10))
const typedValid = computed(() => Number.isInteger(typedNo.value) && typedNo.value >= 1)
const showInput = computed(() => typing.value || props.tiles.length === 0)

async function openInput() {
  typing.value = !typing.value
  if (typing.value) {
    await nextTick()
    input.value?.focus()
  }
}

function pickTyped() {
  if (typedValid.value) emit('pick', typedNo.value)
}

function tileLabel(tile: Tile): string {
  const state = t(`staff.grid.legendState.${tile.state}`)
  return t(isMine(tile) ? 'staff.order.picker.tileMineAria' : 'staff.order.picker.tileAria', { n: tile.tableNo, state })
}
</script>

<template>
  <section class="mt-4" aria-labelledby="table-picker-title" data-test="table-picker">
    <div class="flex items-center justify-between gap-2">
      <h2 id="table-picker-title" class="text-base font-semibold text-slate-900">
        {{ $t('staff.order.picker.title') }}
      </h2>
      <div v-if="mine.length > 0" class="flex gap-0.5 rounded-full bg-slate-200 p-1">
        <button
          type="button"
          class="min-h-[40px] rounded-full px-3 text-sm font-semibold"
          :class="!showAll ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600'"
          :aria-pressed="!showAll"
          data-test="picker-mine"
          @click="showAll = false"
        >
          {{ $t('staff.order.picker.mine', { n: mine.length }) }}
        </button>
        <button
          type="button"
          class="min-h-[40px] rounded-full px-3 text-sm font-semibold"
          :class="showAll ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600'"
          :aria-pressed="showAll"
          data-test="picker-all"
          @click="showAll = true"
        >
          {{ $t('staff.order.picker.all') }}
        </button>
      </div>
    </div>

    <ul v-if="tiles.length > 0" class="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8">
      <li v-for="tile in shown" :key="tile.tableNo">
        <button
          type="button"
          class="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-slate-300 bg-surface text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
          :aria-label="tileLabel(tile)"
          data-test="picker-table"
          @click="emit('pick', tile.tableNo)"
        >
          <span class="flex items-center gap-0.5 text-2xl leading-none font-bold tabular-nums">
            {{ tile.tableNo }}
            <UIcon v-if="showAll && isMine(tile)" name="i-lucide-star" class="size-3 shrink-0 text-brand-ink" aria-hidden="true" />
          </span>
          <span class="inline-block size-2 rounded-full" :class="STATE_DOT[tile.state]" aria-hidden="true" />
        </button>
      </li>
      <li>
        <button
          type="button"
          class="h-16 w-full rounded-xl border-2 border-dashed border-slate-400 px-0.5 text-xs leading-tight font-semibold text-slate-700"
          :aria-expanded="typing"
          data-test="picker-other"
          @click="openInput"
        >
          {{ $t('staff.order.picker.other') }}
        </button>
      </li>
    </ul>

    <div v-if="showInput" class="mt-3 flex items-center gap-2">
      <label for="table-picker-input" class="text-base font-semibold text-slate-900">{{ $t('staff.order.tableLabel') }}</label>
      <input
        id="table-picker-input"
        ref="input"
        v-model="typed"
        type="number"
        inputmode="numeric"
        min="1"
        enterkeyhint="done"
        class="w-28 rounded-lg border-2 border-slate-300 px-3 py-2 text-2xl font-bold"
        data-test="order-table"
        @keydown.enter="pickTyped"
      >
      <button
        type="button"
        class="min-h-[48px] rounded-lg bg-brand px-4 font-semibold text-brand-contrast disabled:opacity-50"
        :disabled="!typedValid"
        data-test="order-table-ok"
        @click="pickTyped"
      >
        {{ $t('staff.order.picker.ok') }}
      </button>
    </div>

    <button
      v-if="current !== null"
      type="button"
      class="mt-3 min-h-[44px] text-sm font-semibold text-brand-ink"
      data-test="picker-keep"
      @click="emit('keep')"
    >
      {{ $t('staff.order.picker.keep', { n: current }) }}
    </button>
  </section>
</template>
