<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { PriceRuleReportRow } from '~/../server/lib/contracts/pricing'

// Sold under a price rule, grouped by rule: units, revenue, discount given.
const props = defineProps<{ rows: PriceRuleReportRow[] }>()

const { euro, itemName } = useFormat()
const groups = computed(() => {
  const map = new Map<string, { name: string; rows: PriceRuleReportRow[]; q: number; total: number; discount: number }>()
  for (const r of props.rows) {
    const key = `${r.ruleId ?? ''}|${r.ruleName}`
    const g = map.get(key) ?? { name: r.ruleName, rows: [], q: 0, total: 0, discount: 0 }
    g.rows.push(r)
    g.q += r.quantity
    g.total += r.totalCents
    g.discount += r.discountCents
    map.set(key, g)
  }
  return [...map.entries()].map(([key, g]) => ({ key, ...g }))
})
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
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.total') }}
        </th>
        <th class="py-2 text-right">
          {{ $t('admin.reports.promo.discount') }}
        </th>
      </tr>
    </thead>
    <tbody v-for="g in groups" :key="g.key" data-test="price-rule-report-group">
      <tr class="border-b border-slate-200 bg-slate-50 font-semibold">
        <td class="py-2 pr-3 text-slate-900">
          {{ g.name }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ g.q }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ euro(g.total) }}
        </td>
        <td class="py-2 text-right tabular-nums">
          {{ euro(g.discount) }}
        </td>
      </tr>
      <tr v-for="r in g.rows" :key="r.menuItemId" class="border-b border-slate-100" data-test="price-rule-report-row">
        <td class="py-2 pl-3 pr-3 text-slate-700">
          {{ itemName(r) }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.quantity }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ euro(r.totalCents) }}
        </td>
        <td class="py-2 text-right tabular-nums">
          {{ euro(r.discountCents) }}
        </td>
      </tr>
    </tbody>
    <tbody v-if="rows.length === 0">
      <tr>
        <td colspan="4" class="py-4 text-center text-slate-500">
          {{ $t('admin.reports.empty') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
