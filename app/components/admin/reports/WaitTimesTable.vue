<script setup lang="ts">
import { useFormat } from '~/composables/useFormat'
import type { WaitTimeRow } from '~/../server/lib/contracts/reports'

defineProps<{ rows: WaitTimeRow[] }>()

const { t } = useI18n()
const { hour: fmtHour } = useFormat()

const stationLabel = (station: string) => t(`common.station.${station}`)

// "4:05 min": minutes and seconds read faster than decimals at a glance.
function duration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = String(Math.round(seconds % 60)).padStart(2, '0')
  return t('admin.reports.wait.duration', { time: `${m}:${s}` })
}
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ t('admin.reports.wait.station') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ t('admin.reports.col.itemCount') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ t('admin.reports.wait.median') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ t('admin.reports.wait.p90') }}
        </th>
        <th class="py-2 text-right">
          {{ t('admin.reports.wait.peak') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.station" class="border-b border-slate-100" :data-test="`wait-row-${r.station}`">
        <td class="py-2 pr-3 text-slate-700">
          {{ stationLabel(r.station) }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.itemCount }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ duration(r.medianSeconds) }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ duration(r.p90Seconds) }}
        </td>
        <td class="py-2 text-right tabular-nums text-slate-700">
          <template v-if="r.peakHour && r.peakHourMedianSeconds !== null">
            {{ t('admin.reports.wait.peakValue', { hour: fmtHour(r.peakHour), time: duration(r.peakHourMedianSeconds) }) }}
          </template>
          <span v-else class="text-slate-400">–</span>
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="5" class="py-4 text-center text-slate-500">
          {{ t('admin.reports.empty') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
