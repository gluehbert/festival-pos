<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { StaffMealReportRow } from '~/../server/lib/contracts/reports'

const props = defineProps<{ rows: StaffMealReportRow[] }>()

const { euro, itemName } = useFormat()
const total = computed(() => props.rows.reduce((t, r) => ({ q: t.q + r.quantity, v: t.v + r.valueCents }), { q: 0, v: 0 }))
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.item') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.quantity') }}
        </th>
        <th class="py-2 text-right">
          {{ $t('admin.reports.meal.value') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="`${r.menuItemId}:${r.nameDe}`" class="border-b border-slate-100" data-test="staff-meal-row">
        <td class="py-2 pr-3 font-medium text-slate-900">
          {{ itemName(r) }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.quantity }}
        </td>
        <td class="py-2 text-right tabular-nums">
          {{ euro(r.valueCents) }}
        </td>
      </tr>
      <tr v-if="rows.length > 1" class="font-semibold">
        <td class="py-2 pr-3">
          {{ $t('admin.reports.deposit.total') }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ total.q }}
        </td>
        <td class="py-2 text-right tabular-nums">
          {{ euro(total.v) }}
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="3" class="py-4 text-center text-slate-500">
          {{ $t('admin.reports.empty') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
