<script setup lang="ts">
import { computed, ref } from 'vue'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'
import { useAdminStore } from '~/stores/admin'
import { useBranding } from '~/composables/useBranding'
import { useFormat } from '~/composables/useFormat'
import type { EndCheck, EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
const { refresh: refreshPublicBranding } = useBranding()
const { euro, dateTime } = useFormat()

const open = ref(false)
const check = ref<EndCheck | null>(null)
const busy = ref(false)
// Ending with open items needs a second tap on the same button.
const armed = ref(false)

const allClear = computed(() => {
  const c = check.value
  return !!c && c.openTables.count === 0 && c.openCashSessions.length === 0 && c.undeliveredItems === 0
})

async function show() {
  busy.value = true
  try {
    check.value = await admin.fetchEndCheck(props.event.id)
    armed.value = false
    open.value = true
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}

async function end() {
  if (!allClear.value && !armed.value) {
    armed.value = true
    return
  }
  busy.value = true
  try {
    await admin.endEvent(props.event.id)
    await refreshPublicBranding()
    open.value = false
    emit('saved', t('admin.end.done'))
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="border-t border-slate-200 px-4 py-3 text-sm" data-test="event-end">
    <p class="text-slate-600">
      {{ $t('admin.end.hint') }}
    </p>
    <button
      type="button"
      class="mt-2 min-h-[44px] rounded border border-slate-400 bg-surface px-3 font-semibold text-slate-900 disabled:opacity-50"
      :disabled="busy"
      data-test="event-end-open"
      @click="show"
    >
      {{ $t('admin.end.button') }}
    </button>

    <ConfirmDialog
      :open="open"
      :title="$t('admin.end.title', { name: event.name })"
      :confirm-label="$t(allClear ? 'admin.end.confirm' : armed ? 'admin.end.confirmFinal' : 'admin.end.confirmAnyway')"
      :busy="busy"
      :danger="!allClear"
      @cancel="open = false"
      @confirm="end"
    >
      <p v-if="allClear" class="font-semibold text-emerald-800">
        {{ $t('admin.end.allClear') }}
      </p>
      <ul v-else-if="check" class="space-y-2">
        <li v-if="check.openTables.count > 0">
          <span class="font-semibold">{{ $t('admin.end.openTables', { n: check.openTables.count, sum: euro(check.openTables.totalCents) }, check.openTables.count) }}</span>
          <br>{{ $t('admin.end.tableList', { list: check.openTables.tableNos.join(', ') }) }}
        </li>
        <li v-if="check.openCashSessions.length > 0">
          <span class="font-semibold">{{ $t('admin.end.openCash', { n: check.openCashSessions.length }, check.openCashSessions.length) }}</span>
          <ul class="list-inside list-disc">
            <li v-for="c in check.openCashSessions" :key="c.username + c.openedAt">
              {{ $t('admin.end.cashLine', { name: c.username, since: dateTime(c.openedAt) }) }}
            </li>
          </ul>
        </li>
        <li v-if="check.undeliveredItems > 0" class="font-semibold">
          {{ $t('admin.end.undelivered', { n: check.undeliveredItems }, check.undeliveredItems) }}
        </li>
      </ul>
      <p v-if="armed" class="rounded border border-rose-300 bg-rose-50 p-2 font-semibold text-rose-900" role="alert">
        {{ $t('admin.end.armed') }}
      </p>
    </ConfirmDialog>
  </div>
</template>
