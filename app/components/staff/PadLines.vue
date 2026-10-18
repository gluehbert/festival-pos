<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import { useStaffOrderStore } from '~/stores/staffOrder'
import LineNote from '~/components/common/LineNote.vue'
import { unitTotal } from '~/utils/order-lines'

// The waiter's pad line by line, where notes are added ("ohne Zwiebeln").
// Tapping an article again adds a line without note, so "1 ohne Zwiebeln,
// 1 normal" is two taps and one note.
const pad = useStaffOrderStore()
const { euro, itemName } = useFormat()
</script>

<template>
  <details class="rounded-lg border border-slate-200" data-test="pad-lines">
    <summary class="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold text-slate-700">
      {{ $t('staff.order.linesTitle') }} ({{ pad.lines.length }})
    </summary>
    <p v-if="pad.isEmpty" class="px-3 pb-2 text-sm text-slate-500">
      {{ $t('staff.order.linesEmpty') }}
    </p>
    <ul v-else class="max-h-56 overflow-y-auto px-3 pb-2">
      <li v-for="line in pad.lines" :key="line.key" class="border-b border-slate-100 py-1 last:border-b-0">
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ line.quantity }} × {{ itemName(line.menuItem) }}</span>
          <span class="text-xs text-slate-500">{{ euro(unitTotal(line.menuItem) * line.quantity) }}</span>
          <button
            type="button"
            class="h-11 w-11 rounded-lg border border-slate-300 text-lg font-bold"
            :aria-label="$t('staff.pay.less', { name: itemName(line.menuItem) })"
            @click="pad.setLineQuantity(line.key, line.quantity - 1)"
          >
            −
          </button>
        </div>
        <LineNote :note="line.note" :name="itemName(line.menuItem)" @update="(n) => pad.setNote(line.key, n)" />
      </li>
    </ul>
  </details>
</template>
