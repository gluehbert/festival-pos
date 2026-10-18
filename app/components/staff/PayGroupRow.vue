<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { PayGroup } from '~/composables/usePaySelection'
import NoteBadge from '~/components/common/NoteBadge.vue'

const props = defineProps<{ group: PayGroup; count: number }>()
const emit = defineEmits<{ (e: 'update', count: number): void }>()

const { euro, itemName } = useFormat()
const name = computed(() => itemName(props.group.sample))
const set = (n: number) => emit('update', Math.max(0, Math.min(props.group.openQuantity, n)))
</script>

<template>
  <li
    data-test="pay-group"
    class="flex items-center gap-3 border-b border-slate-100 py-3 last:border-b-0"
    :class="count > 0 ? 'bg-emerald-50' : ''"
  >
    <div class="min-w-0 flex-1">
      <p class="font-medium text-slate-900">
        {{ name }}
      </p>
      <NoteBadge :note="group.sample.note" />
      <p class="text-xs text-slate-500">
        {{ euro(group.unitPriceCents) }}
        <template v-if="group.sample.depositCents > 0">({{ $t('common.deposit.includedShort', { amount: euro(group.sample.depositCents) }) }})</template>
        · {{ $t('staff.pay.openCount', { n: group.openQuantity }) }}
      </p>
    </div>
    <button
      type="button"
      class="h-11 w-11 rounded-lg border border-slate-300 text-xl font-bold disabled:opacity-40"
      :disabled="count <= 0"
      :aria-label="$t('staff.pay.less', { name })"
      @click="set(count - 1)"
    >
      −
    </button>
    <span class="w-14 text-center text-lg font-bold tabular-nums" :aria-label="$t('staff.pay.countAria', { name })">
      {{ count }}<span class="text-xs font-normal text-slate-500">/{{ group.openQuantity }}</span>
    </span>
    <button
      type="button"
      class="h-11 w-11 rounded-lg border border-slate-300 text-xl font-bold disabled:opacity-40"
      :disabled="count >= group.openQuantity"
      :aria-label="$t('staff.pay.more', { name })"
      @click="set(count + 1)"
    >
      +
    </button>
    <button
      type="button"
      class="h-11 rounded-lg px-2 text-xs font-semibold text-brand-ink hover:bg-slate-100"
      :aria-label="$t('staff.pay.allOf', { name })"
      @click="set(count === group.openQuantity ? 0 : group.openQuantity)"
    >
      {{ count === group.openQuantity ? $t('staff.pay.none') : $t('staff.pay.all') }}
    </button>
  </li>
</template>
