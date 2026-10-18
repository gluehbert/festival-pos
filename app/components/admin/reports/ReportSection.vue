<script setup lang="ts">
import CsvExportButton from '~/components/admin/reports/CsvExportButton.vue'
import type { ReportType } from '~/../server/lib/contracts/reports'

defineProps<{ title: string; eventId: string; type: ReportType; hint?: string }>()
</script>

<template>
  <section class="mb-6 rounded border border-slate-200 bg-surface p-4">
    <header class="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-slate-700">
          {{ title }}
        </h2>
        <p v-if="hint" class="text-xs text-slate-500">
          {{ hint }}
        </p>
      </div>
      <CsvExportButton :event-id="eventId" :type="type" />
    </header>
    <slot />
  </section>
</template>
