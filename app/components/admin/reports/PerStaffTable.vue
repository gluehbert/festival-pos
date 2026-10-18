<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { PaymentsByStaffRow } from '~/../server/lib/contracts/reports'

defineProps<{ rows: PaymentsByStaffRow[] }>()

const { euro: fmtEur } = useFormat()
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.staff', 'Staff') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.paymentCount', 'Payments') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.refundedPaidOut') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.netCash') }}
        </th>
        <th class="py-2 text-right">
          {{ $t('admin.reports.col.tip') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.staffId" class="border-b border-slate-100">
        <td class="py-2 pr-3 font-medium text-slate-900">
          {{ r.username }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.paymentCount }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums text-slate-500">
          {{ r.refundedCents > 0 ? fmtEur(r.refundedCents) : '–' }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ fmtEur(r.totalCents) }}
        </td>
        <td class="py-2 text-right tabular-nums text-slate-500">
          {{ r.tipCents > 0 ? fmtEur(r.tipCents) : '–' }}
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="5" class="py-4 text-center text-slate-500">
          {{ $t('admin.reports.empty', 'No data in current period.') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
