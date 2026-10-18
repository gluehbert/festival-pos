<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

// Price of a menu item; while a price rule runs, the regular price struck
// through and "Happy Hour bis 18:00". The server books the price itself.
const props = defineProps<{ item: MenuItemDto }>()

const { euro, clock } = useFormat()
const promo = computed(() => {
  const p = props.item.promo
  const regular = props.item.regularPriceCents
  return p && regular !== undefined && regular > props.item.priceCents ? { ...p, regular } : null
})
</script>

<template>
  <span>
    <template v-if="promo">
      <s class="mr-1 text-slate-500" data-test="regular-price">
        <span class="sr-only">{{ $t('common.promo.regular') }}</span>{{ euro(promo.regular) }}
      </s>
      <span class="font-semibold text-emerald-700" data-test="price">{{ euro(item.priceCents) }}</span>
      <span
        class="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900"
        data-test="promo-hint"
      >
        <UIcon name="i-lucide-tag" class="size-3 shrink-0" aria-hidden="true" />
        {{ $t('common.promo.until', { name: promo.name, time: clock(promo.endsAt) }) }}
      </span>
    </template>
    <span v-else data-test="price">{{ euro(item.priceCents) }}</span>
  </span>
</template>
