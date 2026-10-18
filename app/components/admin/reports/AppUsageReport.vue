<script setup lang="ts">
import { computed } from 'vue'
import { summarizeUsage } from '~/utils/app-usage'
import type { AppUsageRow } from '~/../server/lib/contracts/reports'

const props = defineProps<{ rows: AppUsageRow[] }>()

const { t, locale } = useI18n()
const s = computed(() => summarizeUsage(props.rows))
const tag = () => (locale.value === 'en' ? 'en-IE' : 'de-DE')

function pct(v: number | null): string {
  return v === null ? t('admin.reports.usage.none') : new Intl.NumberFormat(tag(), { style: 'percent' }).format(v)
}
function num(v: number | null): string {
  return v === null ? t('admin.reports.usage.none') : new Intl.NumberFormat(tag(), { maximumFractionDigits: 1 }).format(v)
}
</script>

<template>
  <div class="space-y-4 text-sm">
    <div class="grid gap-4 sm:grid-cols-3">
      <div>
        <h3 class="mb-1 text-xs font-semibold uppercase text-slate-500">
          {{ t('admin.reports.usage.funnel') }}
        </h3>
        <dl class="space-y-1">
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.reports.usage.scans') }}</dt>
            <dd class="tabular-nums">
              {{ s.scans }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.reports.usage.orderingDevices') }}</dt>
            <dd class="tabular-nums">
              {{ s.orderingDevices }} ({{ pct(s.orderingRate) }})
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.reports.usage.ordersPerDevice') }}</dt>
            <dd class="tabular-nums">
              {{ num(s.ordersPerDevice) }}
            </dd>
          </div>
        </dl>
      </div>
      <div>
        <h3 class="mb-1 text-xs font-semibold uppercase text-slate-500">
          {{ t('admin.reports.usage.share') }}
        </h3>
        <dl class="space-y-1">
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.reports.usage.guestOrderShare') }}</dt>
            <dd class="tabular-nums">
              {{ pct(s.guestOrderShare) }} ({{ s.guestOrders }} / {{ s.guestOrders + s.staffOrders }})
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.reports.usage.guestItemShare') }}</dt>
            <dd class="tabular-nums">
              {{ pct(s.guestItemShare) }}
            </dd>
          </div>
        </dl>
      </div>
      <div>
        <h3 class="mb-1 text-xs font-semibold uppercase text-slate-500">
          {{ t('admin.reports.usage.compare') }}
        </h3>
        <p class="mb-1 text-xs text-slate-500">
          {{ t('admin.reports.usage.staffItemsPerTable') }}
        </p>
        <dl class="space-y-1">
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.reports.usage.appTables', { count: s.appTables }) }}</dt>
            <dd class="tabular-nums">
              {{ num(s.staffItemsPerAppTable) }}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt>{{ t('admin.reports.usage.noAppTables', { count: s.noAppTables }) }}</dt>
            <dd class="tabular-nums">
              {{ num(s.staffItemsPerNoAppTable) }}
            </dd>
          </div>
        </dl>
        <p class="mt-1 text-xs text-slate-500">
          {{ t('admin.reports.usage.compareHint') }}
        </p>
      </div>
    </div>

    <table class="w-full">
      <caption class="mb-1 text-left text-xs font-semibold uppercase text-slate-500">
        {{ t('admin.reports.usage.perTable') }}
      </caption>
      <thead>
        <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
          <th class="py-2 pr-3">
            {{ t('admin.reports.usage.table') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ t('admin.reports.usage.scans') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ t('admin.reports.usage.orderingDevices') }}
          </th>
          <th class="py-2 pr-3 text-right">
            {{ t('admin.reports.usage.guestOrders') }}
          </th>
          <th class="py-2 text-right">
            {{ t('admin.reports.usage.staffOrders') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.tableNo" class="border-b border-slate-100">
          <td class="py-2 pr-3 tabular-nums">
            {{ r.tableNo }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ r.scans }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ r.orderingDevices }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ r.guestOrders }}
          </td>
          <td class="py-2 text-right tabular-nums">
            {{ r.staffOrders }}
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="5" class="py-4 text-center text-slate-500">
            {{ t('admin.reports.empty') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
