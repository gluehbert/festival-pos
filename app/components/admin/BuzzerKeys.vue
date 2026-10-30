<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

// Up to two buzzers at the kitchen/bar, each a one-key keyboard with its
// own lane (1 green, 2 blue). The admin presses the buzzer once and its key
// is stored; rows of the features list.
const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
const FIELDS = ['buzzerKey', 'buzzerKey2'] as const
type Field = (typeof FIELDS)[number]
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']
const busy = ref(false)
const listening = ref<Field | null>(null)

async function save(field: Field, key: string | null) {
  const other = props.event[field === 'buzzerKey' ? 'buzzerKey2' : 'buzzerKey']
  if (key !== null && key === other) {
    emit('failed', t('admin.features.buzzer.sameKey'))
    return
  }
  busy.value = true
  try {
    await admin.setFeatures(props.event.id, { [field]: key })
    emit('saved', t('admin.features.saved'))
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}

function onCaptureKey(e: KeyboardEvent) {
  if (MODIFIERS.includes(e.key) || !listening.value) return
  e.preventDefault()
  e.stopPropagation()
  const field = listening.value
  stop()
  void save(field, e.key)
}

function listen(field: Field) {
  listening.value = field
  window.addEventListener('keydown', onCaptureKey, true)
}

function stop() {
  listening.value = null
  window.removeEventListener('keydown', onCaptureKey, true)
}

onBeforeUnmount(stop)
</script>

<template>
  <li v-for="(field, n) in FIELDS" :key="field" class="flex flex-wrap items-center justify-between gap-4 py-3" :data-test="`buzzer-${n + 1}`">
    <div class="min-w-0 flex-1">
      <p class="font-semibold text-slate-800">
        {{ $t(`admin.features.buzzer.label${n + 1}`) }}
      </p>
      <p class="text-slate-600">
        {{ $t(`admin.features.buzzer.hint${n + 1}`) }}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <template v-if="listening === field">
        <span class="font-semibold text-slate-800" role="status">{{ $t('admin.features.buzzer.listening') }}</span>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100" data-test="buzzer-cancel" @click="stop">
          {{ $t('common.dialog.cancel') }}
        </button>
      </template>
      <template v-else>
        <kbd v-if="event[field]" class="rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-slate-800" data-test="buzzer-current">
          {{ event[field] === ' ' ? $t('admin.features.buzzer.space') : event[field] }}
        </kbd>
        <button
          type="button"
          class="min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          :disabled="busy || listening !== null"
          data-test="buzzer-set"
          @click="listen(field)"
        >
          {{ event[field] ? $t('admin.features.buzzer.change') : $t('admin.features.buzzer.set') }}
        </button>
        <button
          v-if="event[field]"
          type="button"
          class="min-h-[44px] rounded px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          :disabled="busy || listening !== null"
          data-test="buzzer-clear"
          @click="save(field, null)"
        >
          {{ $t('admin.features.buzzer.clear') }}
        </button>
      </template>
    </div>
  </li>
</template>
