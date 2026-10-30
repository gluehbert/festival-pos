<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useMenuStore } from '~/stores/menu'
import { useStaffOrderStore } from '~/stores/staffOrder'
import { useFormat } from '~/composables/useFormat'
import { usePolling } from '~/composables/usePolling'
import OrderMenuRow from '~/components/staff/OrderMenuRow.vue'
import MenuBrowser from '~/components/common/MenuBrowser.vue'
import SendingState from '~/components/common/SendingState.vue'
import PadLines from '~/components/staff/PadLines.vue'
import LastReceipt from '~/components/staff/LastReceipt.vue'
import AllergenLegend from '~/components/common/AllergenLegend.vue'
import { useAllergenDisplay } from '~/composables/useAllergenDisplay'
import { useElementHeight } from '~/composables/useElementHeight'
import PriceChangeNotice from '~/components/common/PriceChangeNotice.vue'
import type { PriceChange } from '~/utils/price-changes'
import { sendBlock } from '~/utils/send-block'
import { useBranding } from '~/composables/useBranding'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

const { t } = useI18n()
const { euro, itemName } = useFormat()
const route = useRoute()
const auth = useAuthStore()
const menu = useMenuStore()
const pad = useStaffOrderStore()
const { shown: showAllergens } = useAllergenDisplay()

// The fixed pad grows when its line list opens: keep the last menu rows
// scrollable above it instead of hidden underneath.
const padBar = useTemplateRef<HTMLElement>('padBar')
const padHeight = useElementHeight(padBar)

// Staff meal (helpers eat for 0 €, with a reason) has no table, like a walk-in.
const isMeal = computed(() => route.query.meal === '1')
const isWalkin = computed(() => route.query.walkin === '1' || isMeal.value)
const mealReason = ref('')
const mealValid = computed(() => !isMeal.value || mealReason.value.trim().length >= 3)
const tableInput = ref(typeof route.query.table === 'string' ? route.query.table : '')
const tableNo = computed(() => Number.parseInt(tableInput.value, 10))
const tableValid = computed(() => isWalkin.value || (Number.isInteger(tableNo.value) && tableNo.value >= 1))
const block = computed(() => sendBlock({ empty: pad.isEmpty, tableValid: tableValid.value, mealValid: mealValid.value }))
const notice = ref<string | null>(null)
const changedPrices = ref<PriceChange[]>([])

// Food prepay: a table pays its food when ordering, so the kitchen starts at once.
const { branding } = useBranding()
const canPayFood = computed(() => !isWalkin.value && branding.value.foodPrepayEnabled && pad.lines.some((l) => l.menuItem.station === 'kitchen'))

const quantities = computed(() => Object.fromEntries(pad.lines.map((l) => [l.menuItem.id, pad.qtyOf(l.menuItem.id)])))

// "Frequent" follows the table number being typed (walk-ins: best sellers only).
const popularTable = computed(() => (!isWalkin.value && tableValid.value ? tableNo.value : null))
let popularTimer: ReturnType<typeof setTimeout> | undefined
watch(popularTable, (table) => {
  clearTimeout(popularTimer)
  popularTimer = setTimeout(() => menu.refreshPopular(table), 300)
})
onBeforeUnmount(() => clearTimeout(popularTimer))

// Pre-check while the pad is open: articles sold out meanwhile leave the
// menu and the pad before sending (also when the phone wakes up).
usePolling(() => menu.refresh(), { intervalMs: 20_000, immediate: false })

// Every menu load (also when a promotion ends) updates the pad's prices and
// says what was sold out meanwhile.
const soldOutNotice = ref<string | null>(null)
watch(() => menu.items, (items) => {
  if (!menu.eventId) return
  const gone = pad.syncWithMenu(items)
  if (gone.length > 0) soldOutNotice.value = t('staff.order.soldOutRemoved', { items: gone.map(itemName).join(', ') })
})

function setQty(item: MenuItemDto, qty: number) {
  notice.value = null
  soldOutNotice.value = null
  changedPrices.value = []
  pad.setQty(item.id, qty, item)
}

onMounted(async () => {
  if (!auth.isAuthenticated) {
    const me = await auth.refresh()
    if (!me) {
      await navigateTo('/staff/login')
      return
    }
  }
  pad.clear()
  await Promise.all([menu.refresh(), menu.refreshPopular(popularTable.value)])
})

async function send(payNow = false) {
  if (block.value) return
  const value = euro(pad.valueCents)
  const mode = isMeal.value ? 'staff_meal' : isWalkin.value ? 'walkin' : 'staff_table'
  const res = await pad.submit(mode, isWalkin.value ? 0 : tableNo.value, payNow, mealReason.value.trim())
  if (!res) return
  changedPrices.value = res.priceChanges
  if (res.priceChanges.length > 0) void menu.refresh()
  if (isMeal.value) {
    notice.value = t('staff.meal.bookedNotice', { amount: value })
    return
  }
  if (res.paid) {
    notice.value = t('staff.order.paidNotice', { amount: euro(res.paid.totalCents) })
    if (!isWalkin.value && !route.query.table) tableInput.value = ''
    return
  }
  if (isWalkin.value && !payNow) {
    await navigateTo(`/staff/${res.ticketKey}`)
    return
  }
  if (pad.error) return
  void menu.refreshPopular(popularTable.value)
  // Booked prices, not the pad's: a promotion may have started or ended.
  const booked = res.order.items.reduce((s, i) => s + (i.unitPriceCents + i.depositCents) * i.quantity, 0)
  notice.value = t('staff.order.sentNotice', { table: tableNo.value, amount: euro(booked) })
  // Next order is usually for another table: ask for the number again.
  if (!route.query.table) tableInput.value = ''
}

const backTo = computed(() => (!isWalkin.value && route.query.table ? `/staff/${route.query.table}` : '/staff'))
</script>

<template>
  <main class="mx-auto max-w-2xl px-4 pb-48 pt-6" :style="padHeight ? { paddingBottom: `${padHeight + 16}px` } : undefined">
    <NuxtLink :to="backTo" class="inline-flex items-center gap-1 text-sm text-slate-500">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.back') }}
    </NuxtLink>
    <h1 class="mt-2 text-2xl font-bold text-slate-900">
      {{ isMeal ? $t('staff.meal.title') : isWalkin ? $t('staff.order.walkinTitle') : $t('staff.order.title') }}
    </h1>

    <label v-if="!isWalkin" class="mt-4 flex items-center gap-3 text-base font-semibold text-slate-900">
      {{ $t('staff.order.tableLabel') }}
      <input
        v-model="tableInput"
        type="number"
        inputmode="numeric"
        min="1"
        class="w-28 rounded-lg border-2 px-3 py-2 text-2xl font-bold"
        :class="block === 'table' ? 'border-rose-500' : 'border-slate-300'"
        :aria-invalid="block === 'table'"
        data-test="order-table"
      >
    </label>

    <label v-if="isMeal" class="mt-4 block text-base font-semibold text-slate-900">
      {{ $t('staff.meal.reasonLabel') }}
      <input
        v-model="mealReason"
        maxlength="120"
        :placeholder="$t('staff.meal.reasonHint')"
        class="mt-1 min-h-[48px] w-full rounded-lg border-2 bg-surface px-3 text-base font-normal"
        :class="block === 'mealReason' ? 'border-rose-500' : 'border-slate-300'"
        :aria-invalid="block === 'mealReason'"
        data-test="meal-reason"
      >
    </label>

    <p v-if="notice" class="mt-3 flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
      <UIcon name="i-lucide-circle-check" class="size-4 shrink-0" aria-hidden="true" /> {{ notice }}
    </p>
    <PriceChangeNotice v-if="changedPrices.length > 0" :changes="changedPrices" class="mt-3" />
    <LastReceipt v-if="notice && isWalkin && !isMeal" />
    <p v-if="pad.error" class="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
      {{ pad.error === 'pay_failed' ? $t('staff.order.payFailed') : pad.error === 'sold_out' ? $t('staff.order.soldOut') : pad.error }}
    </p>
    <p v-if="soldOutNotice" class="mt-3 flex items-center gap-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert" data-test="sold-out-notice">
      <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" aria-hidden="true" /> {{ soldOutNotice }}
    </p>

    <p v-if="menu.loading && menu.items.length === 0" class="mt-6 text-sm text-slate-500">
      {{ $t('guest.menu.loading') }}
    </p>
    <MenuBrowser
      class="mt-4"
      :items="menu.items"
      :popular="menu.popular"
      :quantities="quantities"
      list-class="rounded-lg border border-slate-200 bg-surface px-2"
      tuck-search
    >
      <template #item="{ item }">
        <OrderMenuRow :item="item" :quantity="pad.qtyOf(item.id)" @set="(q) => setQty(item, q)" />
      </template>
    </MenuBrowser>
    <AllergenLegend v-if="showAllergens && menu.items.length > 0" class="mt-4" />

    <aside ref="padBar" class="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-surface px-4 py-3 shadow-lg">
      <div class="mx-auto flex max-w-2xl flex-col gap-2">
        <PadLines />
        <p class="flex justify-between text-base font-semibold">
          <span>{{ $t('staff.order.summary', { n: pad.itemCount }) }}</span>
          <span v-if="isMeal">{{ euro(0) }} <span class="text-xs font-normal text-slate-500">({{ $t('staff.meal.value', { amount: euro(pad.valueCents) }) }})</span></span>
          <span v-else>{{ euro(pad.totalCents) }}</span>
        </p>
        <p v-if="block === 'table' || block === 'mealReason'" class="flex items-center gap-2 text-sm font-semibold text-rose-700" role="status" data-test="order-send-block">
          <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" aria-hidden="true" />
          {{ block === 'table' ? $t('staff.order.blockTable') : $t('staff.order.blockMealReason') }}
        </p>
        <SendingState :sending="pad.sending" @cancel="pad.cancelSending" />
        <div class="flex gap-2">
          <button
            type="button"
            class="min-h-[52px] flex-1 rounded-lg bg-brand-gradient px-4 font-semibold text-brand-contrast disabled:bg-slate-300 disabled:bg-none"
            :disabled="!!block || pad.submitting"
            @click="send(false)"
          >
            {{ pad.submitting ? $t('staff.login.submitting') : isMeal ? $t('staff.meal.book') : $t('staff.order.send') }}
          </button>
          <button
            v-if="isWalkin && !isMeal"
            type="button"
            class="min-h-[52px] flex-1 rounded-lg bg-success px-4 font-semibold text-white disabled:bg-slate-300"
            :disabled="pad.isEmpty || pad.submitting"
            @click="send(true)"
          >
            {{ $t('staff.order.sendAndPay') }}
          </button>
          <button
            v-if="canPayFood"
            type="button"
            class="min-h-[52px] flex-1 rounded-lg bg-success px-4 font-semibold text-white disabled:bg-slate-300"
            :disabled="!!block || pad.submitting"
            data-test="order-send-pay-food"
            @click="send(true)"
          >
            {{ $t('staff.order.sendAndPayFood') }}
          </button>
        </div>
      </div>
    </aside>
  </main>
</template>
