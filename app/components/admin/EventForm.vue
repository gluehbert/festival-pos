<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CreateEvent, EventDto } from '~/../server/lib/contracts/admin'
import { generateEventPin } from '~/utils/event-pin'

const { t } = useI18n()
// Earlier events, newest first: the new one starts like the first of them.
const props = withDefaults(defineProps<{ sources?: EventDto[] }>(), { sources: () => [] })
const emit = defineEmits<{ (e: 'submit', input: CreateEvent): void }>()

const name = ref('')
// Filled in already; the admin may type their own.
const pinCode = ref(generateEventPin())
const tableRangeFrom = ref(1)
const tableRangeTo = ref(24)
const startsOn = ref('')
const endsOn = ref('')
const copyFromId = ref<string>(props.sources[0]?.id ?? '')
const submitting = ref(false)

// Last year's tables are the best guess for this year's.
watch(copyFromId, (id) => {
  const src = props.sources.find((e) => e.id === id)
  if (!src) return
  tableRangeFrom.value = src.tableRangeFrom
  tableRangeTo.value = src.tableRangeTo
}, { immediate: true })
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
      copyFromId: copyFromId.value || null,
    })
    name.value = ''
    pinCode.value = generateEventPin()
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
    <label v-if="sources.length > 0" class="text-sm sm:col-span-4">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.copyFrom') }}</span>
      <select v-model="copyFromId" class="mt-1 min-h-[44px] w-full rounded border border-slate-300 bg-surface px-2" data-test="copy-from">
        <option v-for="e in sources" :key="e.id" :value="e.id">{{ e.name }}</option>
        <option value="">{{ $t('admin.events.copyNone') }}</option>
      </select>
      <span class="mt-1 block text-slate-600">{{ $t(copyFromId ? 'admin.events.copyHint' : 'admin.events.copyNoneHint') }}</span>
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.name', 'Name') }}</span>
      <input v-model="name" required minlength="1" maxlength="200" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <div class="text-sm">
      <label for="event-pin" class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.events.pin', 'PIN') }}</label>
      <div class="mt-1 flex gap-1">
        <input id="event-pin" v-model="pinCode" required maxlength="10" class="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 font-mono uppercase" data-test="event-pin" @input="pinCode = pinCode.toUpperCase()">
        <button type="button" class="min-h-[36px] shrink-0 rounded border border-slate-300 px-2 text-xs font-semibold text-slate-800 hover:bg-slate-50" data-test="event-pin-new" @click="pinCode = generateEventPin()">
          {{ $t('admin.events.pinNew') }}
        </button>
      </div>
    </div>
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
