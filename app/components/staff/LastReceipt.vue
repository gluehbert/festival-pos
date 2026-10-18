<script setup lang="ts">
import { ref } from 'vue'
import { useFormat } from '~/composables/useFormat'
import { usePaymentsStore } from '~/stores/payments'
import ReceiptPrint from '~/components/staff/ReceiptPrint.vue'

// After cashing: offer the receipt of the last payment for printing.
const payments = usePaymentsStore()
const { euro } = useFormat()
const preview = ref(false)

// Prints only the receipt (see html.printing-receipt in main.css).
function print() {
  const root = document.documentElement
  root.classList.add('printing-receipt')
  window.addEventListener('afterprint', () => root.classList.remove('printing-receipt'), { once: true })
  window.print()
}
</script>

<template>
  <div v-if="payments.lastReceipt" class="mt-3 rounded-lg border border-slate-200 bg-surface p-3" data-test="last-receipt">
    <div class="flex flex-wrap items-center gap-2">
      <p class="flex-1 text-sm text-slate-700">
        {{ $t('receipt.last', { amount: euro(payments.lastReceipt.totalCents) }) }}
      </p>
      <button type="button" class="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white" data-test="print-receipt" @click="print">
        <UIcon name="i-lucide-printer" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('receipt.print') }}
      </button>
      <button type="button" class="min-h-[44px] rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100" @click="preview = !preview">
        {{ preview ? $t('receipt.hide') : $t('receipt.show') }}
      </button>
      <button
        type="button"
        class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        :aria-label="$t('receipt.dismiss')"
        @click="payments.lastReceipt = null"
      >
        <UIcon name="i-lucide-x" class="size-4 shrink-0" aria-hidden="true" />
      </button>
    </div>
    <ReceiptPrint v-show="preview" class="mt-3 border border-slate-300" :receipt="payments.lastReceipt.receipt" />
  </div>
</template>
