<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Order } from '~/../server/lib/contracts/guest'
import { formatCents } from '~/../server/lib/money'
import { shortOrderNo } from '~/utils/order-number'
import PriceChangeNotice from '~/components/common/PriceChangeNotice.vue'
import type { PriceChange } from '~/utils/price-changes'

const props = defineProps<{ order: Order; changes?: PriceChange[] }>()
defineEmits<{ 'new-order': [] }>()

const { locale } = useI18n()
const heading = ref<HTMLHeadingElement | null>(null)
defineExpose({ focus: () => heading.value?.focus() })

const total = computed(() => formatCents(props.order.tableBalanceCents, locale.value === 'de' ? 'de' : 'en'))
</script>

<template>
  <div
    class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
    role="status"
  >
    <h2
      ref="heading"
      tabindex="-1"
      class="text-lg font-semibold focus:outline-none"
    >
      {{ $t('guest.confirmation.title') }}
    </h2>
    <p class="mt-1 text-sm">
      {{ $t('guest.confirmation.orderId') }}:
      <span class="font-mono text-base font-bold tracking-wider" data-test="order-number" :title="order.orderId">#{{ shortOrderNo(order.orderId) }}</span>
    </p>
    <PriceChangeNotice v-if="changes?.length" :changes="changes" class="mt-2" />
    <p class="text-sm">
      {{ $t('guest.confirmation.tableBalance') }}:
      <span class="font-semibold">{{ total }}</span>
    </p>
    <button
      type="button"
      class="mt-3 min-h-[44px] rounded bg-success px-4 text-sm font-semibold text-white"
      @click="$emit('new-order')"
    >
      {{ $t('guest.confirmation.newOrder') }}
    </button>
  </div>
</template>
