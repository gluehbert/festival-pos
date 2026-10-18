<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { CashSessionDto } from '~/../server/lib/contracts/cash'

defineProps<{ rows: CashSessionDto[] }>()

const { euro, dateTime } = useFormat()
const diffClass = (d: number | null) => (d === null || d === 0 ? '' : d < 0 ? 'text-rose-700 font-semibold' : 'text-amber-800 font-semibold')
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
          <th class="py-2 pr-3">
            {{ $t('admin.reports.col.staff') }}
          </th>
          <th class="py-2 pr-3">
            {{ $t('admin.reports.cash.openedAt') }} / {{ $t('admin.reports.cash.closedAt') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ $t('admin.reports.cash.opening') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ $t('admin.reports.cash.collected') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ $t('admin.reports.cash.refunded') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ $t('admin.reports.cash.depositReturned') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ $t('admin.reports.cash.expected') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ $t('admin.reports.cash.counted') }}
          </th>
          <th class="py-2 text-right">
            {{ $t('admin.reports.cash.difference') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="border-b border-slate-100" data-test="cash-session-row">
          <td class="py-2 pr-3 font-medium text-slate-900">
            {{ r.username }}
            <p v-if="r.note" class="text-xs font-normal text-slate-500">
              {{ r.note }}
            </p>
          </td>
          <td class="py-2 pr-3 text-xs text-slate-600">
            {{ dateTime(r.openedAt) }}<br>
            {{ r.closedAt ? dateTime(r.closedAt) : $t('admin.reports.cash.stillOpen') }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ euro(r.openingCents) }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ euro(r.collectedCents) }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums text-slate-500">
            {{ r.refundedCents > 0 ? euro(r.refundedCents) : '–' }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums text-slate-500">
            {{ r.depositReturnedCents !== 0 ? euro(r.depositReturnedCents) : '–' }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums font-semibold">
            {{ euro(r.expectedCents) }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ r.countedCents === null ? '–' : euro(r.countedCents) }}
          </td>
          <td class="py-2 text-right tabular-nums" :class="diffClass(r.differenceCents)">
            {{ r.differenceCents === null ? '–' : `${r.differenceCents > 0 ? '+' : ''}${euro(r.differenceCents)}` }}
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="9" class="py-4 text-center text-slate-500">
            {{ $t('admin.reports.empty') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
