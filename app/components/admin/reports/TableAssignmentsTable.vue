<script setup lang="ts">
import { computed } from 'vue'
import type { TableAssignment } from '~/../server/lib/contracts/tables'

const props = defineProps<{ rows: TableAssignment[] }>()

// One line per waiter: "Anna – Tisch 3, 5, 12".
const byStaff = computed(() => {
  const map = new Map<string, { username: string; tables: number[] }>()
  for (const r of props.rows) {
    const entry = map.get(r.staffId) ?? { username: r.username, tables: [] }
    entry.tables.push(r.tableNo)
    map.set(r.staffId, entry)
  }
  return [...map.entries()]
    .map(([staffId, e]) => ({ staffId, ...e, tables: e.tables.sort((a, b) => a - b) }))
    .sort((a, b) => a.username.localeCompare(b.username))
})
</script>

<template>
  <table class="w-full text-sm" data-test="table-assignments-report">
    <thead>
      <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
        <th class="py-2 pr-3">
          {{ $t('admin.reports.col.staff') }}
        </th>
        <th class="py-2 pr-3 text-right">
          {{ $t('admin.reports.col.tableCount') }}
        </th>
        <th class="py-2">
          {{ $t('admin.reports.col.tables') }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in byStaff" :key="r.staffId" class="border-b border-slate-100">
        <td class="py-2 pr-3 font-medium text-slate-900">
          {{ r.username }}
        </td>
        <td class="py-2 pr-3 text-right tabular-nums">
          {{ r.tables.length }}
        </td>
        <td class="py-2 tabular-nums text-slate-700">
          {{ r.tables.join(', ') }}
        </td>
      </tr>
      <tr v-if="rows.length === 0">
        <td colspan="3" class="py-4 text-center text-slate-500">
          {{ $t('admin.reports.noAssignments') }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
