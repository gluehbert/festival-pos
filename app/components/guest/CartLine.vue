<script setup lang="ts">
import { computed } from 'vue'
import { useCartStore, type CartLine } from '~/stores/cart'
import { formatCents } from '~/../server/lib/money'
import LineNote from '~/components/common/LineNote.vue'

// Same threshold as the menu's "only n left" hint.
const LOW_STOCK = 5

const props = defineProps<{ line: CartLine }>()

const cart = useCartStore()
const { locale } = useI18n()
const fmt = (cents: number) => formatCents(cents, locale.value === 'de' ? 'de' : 'en')

const item = computed(() => props.line.menuItem)
const name = computed(() => (locale.value === 'de' ? item.value.nameDe : item.value.nameEn))
// Price without Pfand: the lines add up to the subtotal, Pfand has its own row.
const lineTotal = computed(() => fmt(item.value.priceCents * props.line.quantity))
const lowStock = computed(() => item.value.stock !== null && item.value.stock <= LOW_STOCK)
// Stock counts the article across all its lines (with and without notes).
const atStock = computed(() => item.value.stock !== null && cart.qtyOf(item.value.id) >= item.value.stock)
</script>

<template>
  <li class="py-3" data-test="cart-line">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="font-semibold text-slate-900">
          {{ name }}
          <span
            v-if="item.diet"
            class="ml-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 align-middle text-xs font-medium text-emerald-800"
            data-test="cart-diet"
          >{{ $t(`common.allergens.diet.${item.diet}`) }}</span>
        </p>
        <p class="text-sm text-slate-500" data-test="cart-unit">
          {{ line.quantity }} × {{ fmt(item.priceCents) }}
          <span v-if="item.depositCents > 0" data-test="cart-deposit-each">· {{ $t('guest.cart.depositEach', { amount: fmt(item.depositCents) }) }}</span>
          <span v-if="lowStock" class="font-semibold text-amber-800" data-test="cart-low-stock">
            · {{ $t('common.stock.low', { n: item.stock }) }}
          </span>
        </p>
      </div>
      <span class="shrink-0 font-semibold tabular-nums text-slate-900" data-test="cart-line-total">{{ lineTotal }}</span>
    </div>
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0 flex-1">
        <LineNote :note="line.note" :name="name" @update="(n) => cart.setNote(line.key, n)" />
      </div>
      <div class="mt-1 flex shrink-0 items-center rounded-full border border-slate-300">
        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-full text-lg"
          :class="line.quantity === 1 ? 'text-red-600' : 'text-slate-700'"
          :aria-label="line.quantity === 1 ? $t('guest.cart.remove') : $t('guest.cart.decrease')"
          data-test="cart-decrease"
          @click="cart.setLineQuantity(line.key, line.quantity - 1)"
        >
          <UIcon v-if="line.quantity === 1" name="i-lucide-trash-2" class="size-4 shrink-0" aria-hidden="true" />
          <template v-else>
            −
          </template>
        </button>
        <span class="w-6 text-center text-sm font-semibold tabular-nums" :aria-label="$t('guest.cart.quantity')">{{ line.quantity }}</span>
        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-full text-lg text-slate-700 disabled:opacity-40"
          :aria-label="$t('guest.cart.increase')"
          :disabled="atStock"
          data-test="cart-increase"
          @click="cart.setLineQuantity(line.key, line.quantity + 1)"
        >
          +
        </button>
      </div>
    </div>
  </li>
</template>
