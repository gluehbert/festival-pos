<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

// Changes the table numbers of an event, also while it is live.
const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
const from = ref(props.event.tableRangeFrom)
const to = ref(props.event.tableRangeTo)
const busy = ref(false)

watch(() => [props.event.tableRangeFrom, props.event.tableRangeTo], ([f, l]) => {
  from.value = f!
  to.value = l!
})

async function save() {
  busy.value = true
  try {
    const ev = await admin.setTableRange(props.event.id, { tableRangeFrom: from.value, tableRangeTo: to.value })
    emit('saved', t('admin.tables.saved', { from: ev.tableRangeFrom, to: ev.tableRangeTo }))
  }
  catch (e) {
    const data = (e as { data?: { code?: string; details?: { tableNos?: number[] } } }).data
    emit('failed', data?.code === 'TABLES_OPEN'
      ? t('admin.tables.open', { tables: (data.details?.tableNos ?? []).join(', ') })
      : t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="space-y-3 px-4 py-3 text-sm" data-test="event-tables" @submit.prevent="save">
    <p class="text-slate-600">
      {{ $t('admin.tables.hint') }}
    </p>
    <div class="flex flex-wrap items-end gap-3">
      <label class="block">
        <span class="text-slate-700">{{ $t('admin.events.from') }}</span>
        <input v-model.number="from" name="from" type="number" min="1" required class="mt-1 w-24 rounded border border-slate-300 px-2 py-1">
      </label>
      <label class="block">
        <span class="text-slate-700">{{ $t('admin.events.to') }}</span>
        <input v-model.number="to" name="to" type="number" :min="from" required class="mt-1 w-24 rounded border border-slate-300 px-2 py-1">
      </label>
      <button type="submit" class="min-h-[44px] rounded bg-primary px-3 font-semibold text-white disabled:opacity-50" :disabled="busy">
        {{ $t('admin.tables.save') }}
      </button>
    </div>
  </form>
</template>
