<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import NoteBadge from '~/components/common/NoteBadge.vue'
import type { Receipt } from '~/../server/lib/contracts/staff'

// Paper receipt for the guest. On screen a preview; when printing, only this
// block is shown (see .print-receipt in main.css). Not a tax receipt.
defineProps<{ receipt: Receipt }>()
const { euro, dateTime, itemName } = useFormat()
</script>

<template>
  <section class="print-receipt mx-auto w-full max-w-xs bg-white p-3 font-mono text-sm text-black" data-test="receipt">
    <h2 class="text-center text-base font-bold">
      {{ receipt.eventName }}
    </h2>
    <p class="text-center">
      {{ receipt.tableNo === null ? $t('production.counter') : $t('staff.detail.table', { n: receipt.tableNo }) }}
    </p>
    <hr class="my-2 border-dashed border-black">
    <ul>
      <li v-for="(l, i) in receipt.lines" :key="i" class="py-0.5">
        <div class="flex justify-between gap-2">
          <span>{{ l.quantity }} × {{ itemName(l) }}</span>
          <span class="tabular-nums">{{ euro(l.quantity * l.unitPriceCents) }}</span>
        </div>
        <div v-if="l.depositCents > 0" class="flex justify-between gap-2 pl-4 text-xs">
          <span>+ {{ $t('receipt.deposit') }}</span>
          <span class="tabular-nums">{{ euro(l.quantity * l.depositCents) }}</span>
        </div>
        <NoteBadge v-if="l.note" :note="l.note" class="print:border-0 print:bg-white print:p-0" />
      </li>
    </ul>
    <hr class="my-2 border-dashed border-black">
    <p class="flex justify-between text-base font-bold">
      <span>{{ $t('receipt.total') }}</span>
      <span class="tabular-nums" data-test="receipt-total">{{ euro(receipt.totalCents) }}</span>
    </p>
    <p v-if="receipt.depositCents > 0" class="flex justify-between text-xs">
      <span>{{ $t('receipt.depositIncluded') }}</span>
      <span class="tabular-nums">{{ euro(receipt.depositCents) }}</span>
    </p>
    <p class="mt-2 text-xs">
      {{ dateTime(receipt.paidAt) }} · {{ $t('receipt.servedBy', { name: receipt.staffUsername }) }}
    </p>
    <p class="mt-2 text-center text-xs font-semibold" data-test="receipt-disclaimer">
      {{ $t('receipt.noTaxReceipt') }}
    </p>
  </section>
</template>
