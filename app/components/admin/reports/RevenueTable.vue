<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { RevenueByCategoryRow } from '~/../server/lib/contracts/reports'

defineProps<{ rows: RevenueByCategoryRow[] }>()

const { euro: fmtEur } = useFormat()
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.category', 'Category') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.itemCount', 'Count') }}
        </th>
        <th class="py-2 text-right">
          {{ $t('admin.reports.col.total', 'Revenue') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.category" class="border-b border-slate-100">
        <td class="py-2 pr-3">
          {{ r.category }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.itemCount }}
        </td>
        <td class="py-2 text-right tabular-nums">
          {{ fmtEur(r.totalCents) }}
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="3" class="py-4 text-center text-slate-500">
          {{ $t('admin.reports.empty', 'No data in current period.') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
