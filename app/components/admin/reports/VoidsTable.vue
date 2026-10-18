<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { VoidRow } from '~/../server/lib/contracts/reports'

defineProps<{ rows: VoidRow[] }>()

const { dateTime: fmtDate, euro: fmtEur } = useFormat()
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.item', 'Item') }}
        </th>
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.reason', 'Reason') }}
        </th>
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.voidedAt', 'Voided at') }}
        </th>
        <th class="py-2 text-right">
          {{ $t('admin.reports.col.refunded') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.orderItemId" class="border-b border-slate-100">
        <td class="py-2 pr-3">
          <div class="font-medium text-slate-900">
            {{ r.nameDe }}
          </div>
          <div class="text-xs text-slate-500">
            {{ r.nameEn }}
          </div>
        </td>
        <td class="py-2 pr-3 text-slate-700">
          {{ r.reason }}
        </td>
        <td class="py-2 pr-3 text-slate-600">
          {{ fmtDate(r.voidedAt) }}
        </td>
        <td class="py-2 text-right tabular-nums" :class="r.refundedCents > 0 ? 'text-amber-700' : 'text-slate-500'">
          {{ r.refundedCents > 0 ? fmtEur(r.refundedCents) : '–' }}
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="4" class="py-4 text-center text-slate-500">
          {{ $t('admin.reports.empty', 'No data in current period.') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
