<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ eventId: string; type: string; label?: string }>()

const busy = ref(false)
const error = ref<string | null>(null)

async function onClick() {
  busy.value = true
  error.value = null
  try {
    const res = await fetch(`/api/admin/events/${props.eventId}/reports?type=${encodeURIComponent(props.type)}&format=csv`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.type}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  catch (e) {
    error.value = (e as Error).message
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="inline-flex flex-col items-end">
    <button
      type="button"
      :disabled="busy"
      class="min-h-[36px] rounded border border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      @click="onClick"
    >
      {{ props.label ?? $t('admin.reports.exportCsv', 'Export CSV') }}
    </button>
    <p v-if="error" class="mt-1 text-xs text-rose-600">
      {{ error }}
    </p>
  </div>
</template>
