<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { PricePreviewRow } from '~/../server/lib/contracts/pricing'

// "Gerade aktiv": what guests and waiters see right now.
defineProps<{ rows: PricePreviewRow[] }>()

const { euro, clock, itemName } = useFormat()
</script>

<template>
  <section class="rounded border border-emerald-300 bg-emerald-50 p-4" data-test="price-preview">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-emerald-900">
      <UIcon name="i-lucide-tag" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('admin.pricing.previewTitle') }}
    </h2>
    <p v-if="rows.length === 0" class="mt-1 text-sm text-slate-700">
      {{ $t('admin.pricing.previewEmpty') }}
    </p>
    <ul v-else class="mt-2 divide-y divide-emerald-200 text-sm">
      <li v-for="r in rows" :key="r.menuItemId" class="flex flex-wrap items-baseline gap-x-2 py-1" data-test="price-preview-row">
        <span class="min-w-0 flex-1 font-medium text-slate-900">{{ itemName(r) }}</span>
        <s class="text-slate-500">{{ euro(r.regularPriceCents) }}</s>
        <span class="font-semibold text-emerald-800">{{ euro(r.priceCents) }}</span>
        <span class="w-full text-xs text-slate-600 sm:w-auto">{{ $t('common.promo.until', { name: r.ruleName, time: clock(r.endsAt) }) }}</span>
      </li>
    </ul>
  </section>
</template>
