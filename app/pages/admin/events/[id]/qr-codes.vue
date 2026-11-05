<script setup lang="ts">
import { ref } from 'vue'
import QrRangeForm from '~/components/admin/QrRangeForm.vue'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()

const { t, locale } = useI18n()
const admin = useAdminStore()
const busy = ref(false)
const error = ref<string | null>(null)

const sheetBusy = ref(false)
const sheetError = ref<string | null>(null)

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function onSubmit(from: number, to: number) {
  error.value = null
  busy.value = true
  try {
    save(await admin.downloadQrPdf(props.event.id, from, to), `qr-codes-${from}-${to}.pdf`)
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? t('admin.qr.failed')
  }
  finally {
    busy.value = false
  }
}

async function onCheatSheet() {
  sheetError.value = null
  sheetBusy.value = true
  try {
    save(await admin.downloadCheatSheet(props.event.id, locale.value), `${t('admin.cheatSheet.file')}.pdf`)
  }
  catch {
    sheetError.value = t('admin.cheatSheet.failed')
  }
  finally {
    sheetBusy.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl">
    <p class="mb-3 text-sm text-slate-600">
      {{ $t('admin.qr.hint') }}
    </p>

    <QrRangeForm
      :key="event.id"
      :busy="busy"
      :default-from="event.tableRangeFrom"
      :default-to="event.tableRangeTo"
      @submit="onSubmit"
    />

    <p v-if="error" class="mt-4 text-sm text-rose-600">
      {{ error }}
    </p>

    <section class="mt-8 border-t border-slate-200 pt-6" data-test="cheat-sheet">
      <h2 class="text-lg font-semibold text-slate-900">
        {{ $t('admin.cheatSheet.title') }}
      </h2>
      <p class="mt-1 mb-3 text-sm text-slate-600">
        {{ $t('admin.cheatSheet.hint') }}
      </p>
      <button
        type="button"
        :disabled="sheetBusy"
        class="min-h-[44px] rounded border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50"
        data-test="cheat-sheet-download"
        @click="onCheatSheet"
      >
        {{ $t('admin.cheatSheet.button') }}
      </button>
      <p v-if="sheetError" class="mt-2 text-sm text-rose-600">
        {{ sheetError }}
      </p>
    </section>
  </div>
</template>
