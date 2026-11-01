<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCartStore } from '~/stores/cart'
import { formatCents } from '~/../server/lib/money'
import CartLine from '~/components/guest/CartLine.vue'
import SendingState from '~/components/common/SendingState.vue'
import { useSheetDrag } from '~/composables/useSheetDrag'

defineProps<{ submitting?: boolean; error?: string | null; sending?: { attempt: number, max: number } | null }>()
const emit = defineEmits<{ submit: []; clear: []; cancelSending: [] }>()

const cart = useCartStore()
const { locale } = useI18n()
const fmt = (cents: number) => formatCents(cents, locale.value === 'de' ? 'de' : 'en')
const total = computed(() => fmt(cart.totalCents))

// Food, drinks and cake go to kitchen, bar and cafe counter: headed groups once both are in the cart.
const groups = computed(() => (['kitchen', 'bar', 'cafe'] as const)
  .map((station) => ({ station, lines: cart.lines.filter((l) => l.menuItem.station === station) }))
  .filter((g) => g.lines.length > 0))

// Emptying a full cart by one stray tap would lose the whole order: ask first.
const confirmClear = ref(false)
// Collapsed it is only a slim floating bar (hidden while empty) so the menu keeps
// the screen; opened it becomes a bottom sheet with its close button in view.
const expanded = ref(false)
const sheet = useSheetDrag(() => { expanded.value = false })
// While the sheet is open the page behind it stays put: scrolling it would
// slide the mobile browser bar in and out and shift the whole sheet.
watch(expanded, (open) => {
  document.documentElement.style.overflow = open ? 'hidden' : ''
  if (!open) sheet.reset()
})
watch(() => cart.isEmpty, (empty) => {
  if (!empty) return
  confirmClear.value = false
  expanded.value = false
})
function clear() {
  confirmClear.value = false
  emit('clear')
}

// The bar bumps briefly when something is added, so the tap is noticed.
const bump = ref(false)
let bumpTimer: ReturnType<typeof setTimeout> | undefined
watch(() => cart.itemCount, (now, before) => {
  if (now <= before) return
  bump.value = false
  clearTimeout(bumpTimer)
  requestAnimationFrame(() => { bump.value = true })
  bumpTimer = setTimeout(() => { bump.value = false }, 400)
})
onBeforeUnmount(() => {
  clearTimeout(bumpTimer)
  if (expanded.value) document.documentElement.style.overflow = ''
})
</script>

<template>
  <!-- Keeps the last menu row scrollable above the floating bar. -->
  <div v-if="!cart.isEmpty" class="h-20" aria-hidden="true" />
  <button
    v-if="!cart.isEmpty && !expanded"
    type="button"
    class="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 mx-auto grid min-h-[56px] max-w-3xl grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-full bg-brand-gradient px-4 text-brand-contrast shadow-lg"
    :class="{ 'cart-bump': bump }"
    aria-expanded="false"
    aria-controls="cart-lines"
    data-test="cart-toggle"
    @click="expanded = true"
  >
    <span class="relative flex justify-self-start">
      <UIcon name="i-lucide-shopping-cart" class="size-6 shrink-0" aria-hidden="true" />
      <span class="absolute -right-2 -top-2 min-w-5 rounded-full bg-brand-contrast px-1 text-center text-xs font-bold text-brand" data-test="cart-count">
        {{ cart.itemCount }}
      </span>
    </span>
    <span class="font-semibold">{{ $t('guest.cart.view') }}</span>
    <span class="justify-self-end font-semibold" data-test="cart-bar-total">{{ total }}</span>
  </button>
  <div v-if="expanded" class="fixed inset-0 z-30 touch-none bg-black/40" data-test="cart-backdrop" @click="expanded = false" />
  <aside
    v-if="expanded"
    class="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[calc(100dvh-1rem)] max-w-3xl flex-col rounded-t-2xl border border-slate-200 bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
    :class="{ 'h-[calc(100dvh-1rem)]': sheet.tall.value }"
    :style="sheet.style.value"
    :aria-label="$t('guest.cart.title')"
    @keydown.esc="expanded = false"
  >
    <button
      type="button"
      class="flex h-11 w-full cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      :aria-label="sheet.tall.value ? $t('guest.cart.shrink') : $t('guest.cart.grow')"
      data-test="cart-grip"
      @pointerdown="sheet.start"
      @pointermove="sheet.move"
      @pointerup="sheet.end"
      @pointercancel="sheet.cancel"
      @click="sheet.tap"
    >
      <span class="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />
    </button>
    <div class="flex items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-bold text-slate-900">
          {{ $t('guest.cart.title') }}
        </h2>
        <p class="text-sm text-slate-500" data-test="cart-meta">
          <template v-if="cart.tableNo !== null">
            {{ $t('guest.page.kicker', { table: cart.tableNo }) }} ·
          </template>
          {{ $t('guest.cart.items', { n: cart.itemCount }, cart.itemCount) }}
        </p>
      </div>
      <button
        type="button"
        class="h-11 w-11 rounded-lg text-slate-600 hover:bg-slate-100"
        :aria-label="$t('guest.cart.hide')"
        aria-expanded="true"
        aria-controls="cart-lines"
        data-test="cart-close"
        @click="expanded = false"
      >
        <UIcon name="i-lucide-chevron-down" class="mx-auto size-5 shrink-0" aria-hidden="true" />
      </button>
    </div>
    <div id="cart-lines" class="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain" :class="{ 'max-h-[55vh]': !sheet.tall.value }" data-test="cart-list">
      <section v-for="group in groups" :key="group.station" data-test="cart-group">
        <h3
          v-if="groups.length > 1"
          class="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
          data-test="cart-group-title"
        >
          {{ $t(`guest.cart.group.${group.station}`) }}
        </h3>
        <ul class="divide-y divide-slate-100" role="list">
          <CartLine v-for="line in group.lines" :key="line.key" :line="line" />
        </ul>
      </section>
    </div>
    <p v-if="error" class="mt-2 text-sm text-red-600" role="alert">
      {{ error }}
    </p>
    <dl class="mt-2 space-y-1 border-t border-slate-200 pt-3 text-sm tabular-nums">
      <template v-if="cart.depositCents > 0">
        <div class="flex justify-between text-slate-600">
          <dt>{{ $t('guest.cart.subtotal') }}</dt>
          <dd>{{ fmt(cart.totalCents - cart.depositCents) }}</dd>
        </div>
        <div class="flex justify-between text-slate-600" data-test="cart-deposit">
          <dt>{{ $t('guest.cart.deposit') }}</dt>
          <dd>{{ fmt(cart.depositCents) }}</dd>
        </div>
      </template>
      <div class="flex justify-between text-base font-bold text-slate-900">
        <dt>{{ $t('guest.cart.total') }}</dt>
        <dd data-test="cart-total">
          {{ total }}
        </dd>
      </div>
    </dl>
    <button
      type="button"
      class="mt-3 min-h-[52px] w-full rounded-full bg-brand-gradient px-4 text-base font-semibold text-brand-contrast shadow disabled:opacity-60"
      :disabled="cart.isEmpty || submitting"
      data-test="cart-submit"
      @click="emit('submit')"
    >
      {{ submitting ? $t('guest.cart.submitting') : `${$t('guest.cart.submit')} · ${total}` }}
    </button>
    <SendingState class="mt-2" :sending="sending ?? null" @cancel="emit('cancelSending')" />
    <div v-if="confirmClear" class="mt-2 flex flex-wrap items-center justify-center gap-2" role="group" :aria-label="$t('guest.cart.clearConfirm')">
      <span class="text-sm font-semibold text-slate-700">{{ $t('guest.cart.clearConfirm') }}</span>
      <button
        type="button"
        class="min-h-[44px] rounded px-3 text-sm text-slate-700 hover:bg-slate-100"
        data-test="cart-clear-cancel"
        @click="confirmClear = false"
      >
        {{ $t('guest.cart.clearCancel') }}
      </button>
      <button
        type="button"
        class="min-h-[44px] rounded bg-danger px-4 text-sm font-semibold text-white"
        data-test="cart-clear-confirm"
        @click="clear"
      >
        {{ $t('guest.cart.clearYes') }}
      </button>
    </div>
    <button
      v-else
      type="button"
      class="mx-auto mt-1 block min-h-[44px] px-3 text-sm text-slate-500 underline-offset-2 hover:underline"
      data-test="cart-clear"
      @click="confirmClear = true"
    >
      {{ $t('guest.cart.clear') }}
    </button>
  </aside>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .cart-bump {
    animation: cart-bump 0.35s ease-out;
  }
}
@keyframes cart-bump {
  40% { transform: scale(1.06); }
}
</style>
