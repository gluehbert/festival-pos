<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import LastReceipt from '~/components/staff/LastReceipt.vue'

// Shown once the ticket is fully paid: what was taken, the change to hand
// back and the receipt, before the waiter goes back to the overview.
defineProps<{ amountCents: number; changeCents: number | null }>()
const { euro } = useFormat()
</script>

<template>
  <section class="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center" role="status" data-test="pay-done">
    <UIcon name="i-lucide-circle-check" class="mx-auto size-10 text-emerald-700" aria-hidden="true" />
    <p class="mt-2 text-sm text-emerald-800">
      {{ $t('staff.pay.doneTitle') }}
    </p>
    <p class="mt-1 text-3xl font-bold text-slate-900" data-test="pay-done-amount">
      {{ $t('staff.pay.success', { amount: euro(amountCents) }) }}
    </p>
    <p v-if="changeCents !== null" class="mt-2 text-xl font-bold text-emerald-700" data-test="pay-done-change">
      {{ $t('staff.pay.change', { amount: euro(changeCents) }) }}
    </p>
  </section>
  <LastReceipt />
  <NuxtLink
    to="/staff"
    class="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded bg-primary px-4 text-base font-semibold text-white hover:bg-primary-hover"
    data-test="pay-done-overview"
  >
    <UIcon name="i-lucide-layout-grid" class="size-5 shrink-0" aria-hidden="true" /> {{ $t('staff.pay.toOverview') }}
  </NuxtLink>
</template>
