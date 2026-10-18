<script setup lang="ts">
import { computed } from 'vue'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import { formatCents } from '~/../server/lib/money'
import AllergenCodes from '~/components/common/AllergenCodes.vue'
import { useAllergenDisplay } from '~/composables/useAllergenDisplay'
import PromoPrice from '~/components/common/PromoPrice.vue'

const props = defineProps<{ item: MenuItemDto }>()
const LOW_STOCK = 5
const emit = defineEmits<{ add: [] }>()

const { locale } = useI18n()
const { shown: showAllergens } = useAllergenDisplay()

const name = computed(() => (locale.value === 'de' ? props.item.nameDe : props.item.nameEn))
const deposit = computed(() => formatCents(props.item.depositCents ?? 0, locale.value === 'de' ? 'de' : 'en'))
</script>

<template>
  <article
    class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-surface p-3"
  >
    <div>
      <p class="font-medium text-slate-900">
        {{ name }}
      </p>
      <p class="text-sm text-slate-500">
        <PromoPrice :item="item" />
        <span v-if="item.depositCents > 0" data-test="menu-deposit">{{ $t('common.deposit.plus', { amount: deposit }) }}</span>
      </p>
      <p v-if="item.stock !== null && item.stock <= LOW_STOCK" class="text-xs font-semibold text-amber-800" data-test="menu-low-stock">
        {{ $t('common.stock.low', { n: item.stock }) }}
      </p>
      <AllergenCodes v-if="showAllergens" :allergens="item.allergens" :diet="item.diet" class="mt-1" />
    </div>
    <button
      type="button"
      class="min-h-[44px] min-w-[44px] shrink-0 rounded-lg border border-brand-ink/40 bg-brand-soft px-4 text-sm font-semibold text-brand-ink"
      data-test="menu-add"
      :aria-label="$t('guest.menu.addAria', { name })"
      @click="emit('add')"
    >
      {{ $t('guest.menu.add') }}
    </button>
  </article>
</template>
