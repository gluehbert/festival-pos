<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { TipRow } from '~/../server/lib/contracts/reports'

defineProps<{ rows: TipRow[] }>()

const { euro } = useFormat()
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.staff') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.tipCount') }}
        </th>
        <th class="py-2 text-right">
          {{ $t('admin.reports.col.tip') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(r, i) in rows"
        :key="r.staffId ?? 'total'"
        class="border-b border-slate-100"
        :class="{ 'font-bold': r.staffId === null }"
        :data-test="r.staffId === null ? 'tips-total' : `tips-row-${i}`"
      >
        <td class="py-2 pr-3 text-slate-900" :class="{ 'font-medium': r.staffId !== null }">
          {{ r.username ?? $t('admin.reports.sections.tipsTotal') }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.paymentCount }}
        </td>
        <td class="py-2 text-right tabular-nums">
          {{ euro(r.tipCents) }}
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
