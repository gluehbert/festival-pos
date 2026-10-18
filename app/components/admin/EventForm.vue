<script setup lang="ts">
import { ref } from 'vue'
import type { CreateEvent } from '~/../server/lib/contracts/admin'

const { t } = useI18n()
const emit = defineEmits<{ (e: 'submit', input: CreateEvent): void }>()

const name = ref('')
const pinCode = ref('')
const tableRangeFrom = ref(1)
const tableRangeTo = ref(24)
const startsOn = ref('')
const endsOn = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

async function onSubmit() {
  error.value = null
  if (!/^[A-Z0-9]{4,10}$/.test(pinCode.value)) {
    error.value = t('admin.validation.eventPin')
    return
  }
  if (tableRangeTo.value < tableRangeFrom.value) {
    error.value = t('admin.validation.toGteFrom')
    return
  }
  if (startsOn.value && endsOn.value && endsOn.value < startsOn.value) {
    error.value = t('admin.validation.endsAfterStart')
    return
  }
  submitting.value = true
  try {
    emit('submit', {
      name: name.value.trim(),
      pinCode: pinCode.value,
      tableRangeFrom: tableRangeFrom.value,
      tableRangeTo: tableRangeTo.value,
      startsOn: startsOn.value || null,
      endsOn: endsOn.value || null,
    })
    name.value = ''
    pinCode.value = ''
    startsOn.value = ''
    endsOn.value = ''
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="grid gap-3 rounded border border-slate-200 bg-surface p-4 sm:grid-cols-4" @submit.prevent="onSubmit">
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.name', 'Name') }}</span>
      <input v-model="name" required minlength="1" maxlength="200" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.pin', 'PIN') }}</span>
      <input v-model="pinCode" required class="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono uppercase" @input="pinCode = pinCode.toUpperCase()">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.from', 'Table from') }}</span>
      <input v-model.number="tableRangeFrom" type="number" min="1" required class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.to', 'Table to') }}</span>
      <input v-model.number="tableRangeTo" type="number" min="1" required class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm sm:col-span-2">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.startsOn') }}</span>
      <input v-model="startsOn" type="date" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm sm:col-span-2">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.endsOn') }}</span>
      <input v-model="endsOn" type="date" :min="startsOn || undefined" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <p v-if="error" class="sm:col-span-4 text-sm text-rose-700">
      {{ error }}
    </p>
    <button type="submit" :disabled="submitting" class="sm:col-span-4 min-h-[44px] rounded bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50">
      {{ $t('admin.events.create', 'Create') }}
    </button>
  </form>
</template>
