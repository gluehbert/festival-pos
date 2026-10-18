<script setup lang="ts">
import { ref } from 'vue'

const { t } = useI18n()
const props = defineProps<{
  defaultFrom?: number
  defaultTo?: number
  busy?: boolean
}>()

const emit = defineEmits<{ (e: 'submit', from: number, to: number): void }>()

const from = ref(props.defaultFrom ?? 1)
const to = ref(props.defaultTo ?? 24)
const error = ref<string | null>(null)

function onSubmit() {
  error.value = null
  if (!Number.isInteger(from.value) || from.value < 1) {
    error.value = t('admin.validation.fromMin')
    return
  }
  if (!Number.isInteger(to.value) || to.value < from.value) {
    error.value = t('admin.validation.toGteFrom')
    return
  }
  emit('submit', from.value, to.value)
}
</script>

<template>
  <form class="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-surface p-4" @submit.prevent="onSubmit">
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.qr.from', 'Table from') }}</span>
      <input v-model.number="from" type="number" min="1" required class="mt-1 w-28 rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.qr.to', 'Table to') }}</span>
      <input v-model.number="to" type="number" min="1" required class="mt-1 w-28 rounded border border-slate-300 px-2 py-1">
    </label>
    <button type="submit" :disabled="busy" class="min-h-[44px] rounded bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
      {{ $t('admin.qr.download', 'Download PDF') }}
    </button>
    <p v-if="error" class="basis-full text-sm text-rose-600">
      {{ error }}
    </p>
  </form>
</template>
