<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { OpenOrder } from '~/composables/usePaySelection'
import { shortOrderNo } from '~/utils/order-number'

// Quick pick for groups that share a table: tap the orders this guest pays.
defineProps<{ orders: OpenOrder[]; chosen: ReadonlySet<string> }>()
const emit = defineEmits<{ (e: 'toggle', orderId: string): void }>()

const { euro, clock, itemName } = useFormat()
</script>

<template>
  <section class="mt-4">
    <h2 class="text-sm font-semibold text-slate-600">
      {{ $t('staff.pay.byOrder') }}
    </h2>
    <ul class="mt-2 space-y-2">
      <li v-for="o in orders" :key="o.orderId">
        <button
          type="button"
          data-test="pay-order"
          class="flex min-h-[44px] w-full items-start gap-3 rounded-lg border-2 px-3 py-2 text-left"
          :class="chosen.has(o.orderId) ? 'border-success bg-emerald-50' : 'border-slate-200 bg-surface'"
          :aria-pressed="chosen.has(o.orderId)"
          @click="emit('toggle', o.orderId)"
        >
          <UIcon
            :name="chosen.has(o.orderId) ? 'i-lucide-square-check' : 'i-lucide-square'"
            class="mt-0.5 size-5 shrink-0 text-slate-500"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-mono text-sm font-semibold text-slate-700">
              #{{ shortOrderNo(o.orderId) }} · {{ clock(o.orderedAt) }}
            </span>
            <span class="block text-sm text-slate-600">
              {{ o.lines.map((l) => `${l.quantity} × ${itemName(l)}`).join(', ') }}
            </span>
          </span>
          <span class="shrink-0 font-semibold tabular-nums text-slate-900">{{ euro(o.openCents) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>
