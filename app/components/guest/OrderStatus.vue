<script setup lang="ts">
import { computed } from 'vue'
import type { SessionOrders } from '~/../server/lib/contracts/guest'

const props = defineProps<{ orders: SessionOrders }>()
const { locale } = useI18n()
const ready = computed(() => props.orders.items.filter((i) => i.productionStatus === 'done').length)
</script>

<!-- Above the menu and collapsed: guests find it at once without scrolling past the cart. -->
<template>
  <details class="rounded-lg border border-slate-200 bg-surface p-4" aria-live="polite" data-test="order-status">
    <summary class="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
      <UIcon name="i-lucide-receipt" class="size-4 shrink-0" aria-hidden="true" />
      <span class="flex-1">{{ $t('guest.page.statusHeading') }} ({{ orders.items.length }})</span>
      <span v-if="ready > 0" class="font-normal text-slate-500" data-test="order-status-ready">
        {{ $t('guest.page.statusReady', { count: ready }) }}
      </span>
    </summary>
    <ul class="mt-2 space-y-1 text-sm">
      <li v-for="item in orders.items" :key="item.orderItemId" class="flex justify-between">
        <span>
          {{ item.quantity }} × {{ locale === 'de' ? item.nameDe : item.nameEn }}
          <span v-if="item.note" class="text-xs text-amber-800">({{ item.note }})</span>
        </span>
        <span v-if="item.awaitingPayment" class="font-semibold text-sky-800" data-test="awaiting-payment">{{ $t('guest.production.awaitingPayment') }}</span>
        <span v-else class="text-slate-500">{{ $t(`guest.production.${item.productionStatus}`) }}</span>
      </li>
    </ul>
  </details>
</template>
