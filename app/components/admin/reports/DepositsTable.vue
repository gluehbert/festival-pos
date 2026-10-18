<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { DepositReportRow } from '~/../server/lib/contracts/deposit'

const props = defineProps<{ rows: DepositReportRow[] }>()

const { euro } = useFormat()
const total = computed(() => props.rows.reduce(
  (t, r) => ({ issued: t.issued + r.issuedCents, returned: t.returned + r.returnedCents, balance: t.balance + r.balanceCents }),
  { issued: 0, returned: 0, balance: 0 },
))
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ $t('admin.reports.deposit.unit') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.deposit.issued') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.deposit.returned') }}
        </th>
        <th class="py-2 text-right">
          {{ $t('admin.reports.deposit.balance') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.unitCents" class="border-b border-slate-100" data-test="deposit-row">
        <td class="py-2 pr-3 font-medium text-slate-900">
          {{ euro(r.unitCents) }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.issuedQuantity }} × = {{ euro(r.issuedCents) }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.returnedQuantity }} × = {{ euro(r.returnedCents) }}
        </td>
        <td class="py-2 text-right tabular-nums font-semibold">
          {{ euro(r.balanceCents) }}
        </td>
      </tr>
      <tr v-if="rows.length > 1" class="font-semibold">
        <td class="py-2 pr-3">
          {{ $t('admin.reports.deposit.total') }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ euro(total.issued) }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ euro(total.returned) }}
        </td>
        <td class="py-2 text-right tabular-nums">
          {{ euro(total.balance) }}
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="4" class="py-4 text-center text-slate-500">
          {{ $t('admin.reports.empty') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
