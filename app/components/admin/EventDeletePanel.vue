<script setup lang="ts">
import { computed, ref } from 'vue'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'
import { useAdminStore } from '~/stores/admin'
import { downloadReportCsv } from '~/utils/download-report'
import { ReportTypeEnum } from '~/../server/lib/contracts/reports'
import type { EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'failed', text: string): void; (e: 'deleted'): void }>()

const { t } = useI18n()
const admin = useAdminStore()

// The server does not require the export; the page only unlocks "delete"
// once every report was downloaded in this visit.
const exported = ref(false)
const exporting = ref(false)
const exportError = ref(false)
const open = ref(false)
const typedName = ref('')
const busy = ref(false)

const nameMatches = computed(() => typedName.value === props.event.name)

async function exportAll() {
  exporting.value = true
  exportError.value = false
  try {
    for (const type of ReportTypeEnum.options) await downloadReportCsv(props.event.id, type)
    exported.value = true
  }
  catch {
    exportError.value = true
  }
  finally {
    exporting.value = false
  }
}

function ask() {
  typedName.value = ''
  open.value = true
}

async function remove() {
  if (!nameMatches.value) return
  busy.value = true
  try {
    await admin.deleteEvent(props.event.id)
    open.value = false
    emit('deleted')
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
  <div v-if="!event.isActive && event.deactivatedAt" class="rounded border-2 border-rose-300 bg-rose-50 p-4 text-sm" data-test="event-delete">
    <h2 class="font-semibold text-rose-900">
      {{ $t('admin.delete.title') }}
    </h2>
    <p class="mt-1 text-rose-900">
      {{ $t('admin.delete.intro') }}
    </p>
    <ol class="mt-3 space-y-3">
      <li>
        <button
          type="button"
          class="min-h-[44px] rounded border border-rose-400 bg-surface px-3 font-semibold text-rose-900 disabled:opacity-50"
          :disabled="exporting"
          data-test="event-export"
          @click="exportAll"
        >
          {{ $t(exported ? 'admin.delete.exportAgain' : 'admin.delete.export') }}
        </button>
        <p v-if="exported" class="mt-1 text-emerald-800">
          {{ $t('admin.delete.exported') }}
        </p>
        <p v-if="exportError" class="mt-1 text-rose-900" role="alert">
          {{ $t('admin.delete.exportFailed') }}
        </p>
      </li>
      <li>
        <button
          type="button"
          class="min-h-[44px] rounded bg-danger px-3 font-semibold text-white disabled:opacity-50"
          :disabled="!exported"
          data-test="event-delete-open"
          @click="ask"
        >
          {{ $t('admin.delete.button') }}
        </button>
        <p v-if="!exported" class="mt-1 text-rose-900">
          {{ $t('admin.delete.needsExport') }}
        </p>
      </li>
    </ol>

    <ConfirmDialog
      :open="open"
      :title="$t('admin.delete.dialogTitle', { name: event.name })"
      :confirm-label="$t('admin.delete.confirm')"
      :busy="busy"
      :confirm-disabled="!nameMatches"
      danger
      @cancel="open = false"
      @confirm="remove"
    >
      <p class="font-semibold text-rose-900">
        {{ $t('admin.delete.warning') }}
      </p>
      <label class="block">
        {{ $t('admin.delete.typeName', { name: event.name }) }}
        <input
          v-model="typedName"
          class="mt-1 min-h-[44px] w-full rounded border border-slate-300 bg-surface px-3"
          autocomplete="off"
          data-test="event-delete-name"
        >
      </label>
    </ConfirmDialog>
  </div>
</template>
