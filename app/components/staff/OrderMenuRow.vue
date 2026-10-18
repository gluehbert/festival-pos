<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import AllergenCodes from '~/components/common/AllergenCodes.vue'
import { useAllergenDisplay } from '~/composables/useAllergenDisplay'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import PromoPrice from '~/components/common/PromoPrice.vue'

const props = defineProps<{ item: MenuItemDto; quantity: number }>()
const emit = defineEmits<{ (e: 'set', quantity: number): void }>()

const { euro, itemName } = useFormat()
const { shown: showAllergens } = useAllergenDisplay()
const name = computed(() => itemName(props.item))
</script>

<template>
  <li
    data-test="order-menu-item"
    class="flex items-center gap-3 border-b border-slate-100 py-2 last:border-b-0"
    :class="quantity > 0 ? 'bg-emerald-50' : ''"
  >
    <button
      type="button"
      class="min-h-[44px] min-w-0 flex-1 text-left"
      :aria-label="$t('staff.order.addAria', { name })"
      @click="emit('set', quantity + 1)"
    >
      <span class="block font-medium text-slate-900">{{ name }}</span>
      <span class="block text-xs text-slate-500">
        <PromoPrice :item="item" />
        <template v-if="item.depositCents > 0">{{ $t('common.deposit.plus', { amount: euro(item.depositCents) }) }}</template>
        <span v-if="item.stock !== null && item.stock <= 5" class="font-semibold text-amber-800"> · {{ $t('common.stock.low', { n: item.stock }) }}</span>
      </span>
      <AllergenCodes v-if="showAllergens" :allergens="item.allergens" :diet="item.diet" class="mt-0.5" />
    </button>
    <button
      type="button"
      class="h-11 w-11 rounded-lg border border-slate-300 text-xl font-bold disabled:opacity-40"
      :disabled="quantity <= 0"
      :aria-label="$t('staff.pay.less', { name })"
      @click="emit('set', quantity - 1)"
    >
      −
    </button>
    <span class="w-8 text-center text-lg font-bold tabular-nums">{{ quantity }}</span>
    <button
      type="button"
      class="h-11 w-11 rounded-lg border border-slate-300 text-xl font-bold disabled:opacity-40"
      :disabled="quantity >= 50"
      :aria-label="$t('staff.pay.more', { name })"
      @click="emit('set', quantity + 1)"
    >
      +
    </button>
  </li>
</template>
