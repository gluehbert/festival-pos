<script setup lang="ts">
import { ref } from 'vue'
import { useAdminStore } from '~/stores/admin'
import type { MenuImportResult } from '~/../server/lib/contracts/admin'

const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ (e: 'imported', result: MenuImportResult): void }>()

const { t } = useI18n()
const admin = useAdminStore()
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const preview = ref<MenuImportResult | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

function message(e: unknown): string {
  return (e as { data?: { message?: string } })?.data?.message ?? t('admin.toast.actionFailed')
}

async function downloadTemplate() {
  error.value = null
  busy.value = true
  try {
    const blob = await admin.downloadMenuTemplate(props.eventId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'speisekarte.xlsx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  catch (e) {
    error.value = message(e)
  }
  finally {
    busy.value = false
  }
}

async function onFileChange(ev: Event) {
  const selected = (ev.target as HTMLInputElement).files?.[0] ?? null
  file.value = selected
  preview.value = null
  error.value = null
  if (!selected) return
  busy.value = true
  try {
    preview.value = await admin.importMenu(props.eventId, selected, true)
  }
  catch (e) {
    error.value = message(e)
  }
  finally {
    busy.value = false
  }
}

function reset() {
  file.value = null
  preview.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function apply() {
  if (!file.value) return
  busy.value = true
  error.value = null
  try {
    const result = await admin.importMenu(props.eventId, file.value, false)
    if (result.applied) {
      emit('imported', result)
      reset()
    }
    else {
      preview.value = result
    }
  }
  catch (e) {
    error.value = message(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded border border-slate-200 bg-surface p-4" aria-labelledby="menu-import-heading">
    <h2 id="menu-import-heading" class="text-sm font-semibold text-slate-700">
      {{ $t('admin.menuImport.title') }}
    </h2>
    <p class="mt-1 text-sm text-slate-600">
      {{ $t('admin.menuImport.hint') }}
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="min-h-[44px] rounded border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        :disabled="busy"
        @click="downloadTemplate"
      >
        {{ $t('admin.menuImport.download') }}
      </button>
      <label class="min-h-[44px] cursor-pointer content-center rounded bg-primary px-3 text-sm font-semibold text-white">
        {{ $t('admin.menuImport.choose') }}
        <input
          ref="fileInput"
          type="file"
          class="sr-only"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          :disabled="busy"
          @change="onFileChange"
        >
      </label>
      <span v-if="file" class="text-sm text-slate-600">{{ file.name }}</span>
      <span v-if="busy" class="text-sm text-slate-500" role="status">{{ $t('admin.loading') }}</span>
    </div>

    <p v-if="error" class="mt-3 text-sm text-rose-700" role="alert">
      {{ error }}
    </p>

    <div v-if="preview" class="mt-4 space-y-3" data-test="menu-import-preview">
      <p class="text-sm text-slate-800">
        {{ $t('admin.menuImport.summary', { created: preview.created, updated: preview.updated, unchanged: preview.unchanged }) }}
      </p>

      <div v-if="preview.errors.length > 0" class="rounded bg-rose-50 p-3 text-sm text-rose-800" role="alert">
        <p class="font-semibold">
          {{ $t('admin.menuImport.errorsTitle', { n: preview.errors.length }) }}
        </p>
        <ul class="mt-1 list-disc pl-5">
          <li v-for="e in preview.errors" :key="`${e.row}-${e.message}`">
            {{ $t('admin.menuImport.row', { row: e.row }) }}: {{ e.message }}
          </li>
        </ul>
      </div>

      <ul v-if="preview.rows.length > 0" class="max-h-64 divide-y divide-slate-100 overflow-auto rounded border border-slate-200 text-sm">
        <li v-for="r in preview.rows" :key="r.row" class="flex justify-between px-3 py-1.5">
          <span>{{ r.nameDe }}</span>
          <span
            class="rounded-full px-2 text-xs font-semibold"
            :class="r.action === 'create' ? 'bg-emerald-100 text-emerald-800' : r.action === 'update' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'"
          >{{ $t(`admin.menuImport.action.${r.action}`) }}</span>
        </li>
      </ul>

      <div class="flex gap-3">
        <button
          type="button"
          class="min-h-[44px] rounded bg-success px-4 text-sm font-semibold text-white disabled:bg-slate-300"
          :disabled="busy || preview.errors.length > 0 || preview.created + preview.updated === 0"
          @click="apply"
        >
          {{ $t('admin.menuImport.apply') }}
        </button>
        <button type="button" class="min-h-[44px] rounded px-3 text-sm text-slate-700 hover:bg-slate-100" @click="reset">
          {{ $t('admin.menuImport.cancel') }}
        </button>
      </div>
    </div>
  </section>
</template>
