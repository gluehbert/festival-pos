<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { PriceChange } from '~/utils/price-changes'

// Shown after an order when the server booked other prices than the cart
// showed (a promotion started or ended meanwhile). The menu is reloaded.
defineProps<{ changes: PriceChange[] }>()

const { euro, itemName } = useFormat()
</script>

<template>
  <div class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert" data-test="price-change">
    <p class="flex items-center gap-2 font-semibold">
      <UIcon name="i-lucide-badge-alert" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('common.promo.changedTitle') }}
    </p>
    <ul class="mt-1 space-y-0.5">
      <li v-for="c in changes" :key="c.menuItemId" data-test="price-change-line">
        {{ $t('common.promo.changedLine', { name: itemName(c), booked: euro(c.bookedCents), shown: euro(c.shownCents) }) }}
        <template v-if="c.ruleName">
          ({{ c.ruleName }})
        </template>
      </li>
    </ul>
    <p class="mt-1 text-xs">
      {{ $t('common.promo.changedHint') }}
    </p>
  </div>
</template>
