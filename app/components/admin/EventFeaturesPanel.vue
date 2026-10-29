<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { useBranding } from '~/composables/useBranding'
import type { EventDto } from '~/../server/lib/contracts/admin'

// Optional features of an event. Off, they take no room on the staff
// screens and the server refuses them.
const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
// The service screen reads the switches from the public branding.
const { refresh: refreshPublicBranding } = useBranding()
const busy = ref(false)
const FEATURES = ['depositEnabled', 'staffMealsEnabled', 'waiterCallsEnabled'] as const

async function toggle(key: (typeof FEATURES)[number]) {
  busy.value = true
  try {
    await admin.setFeatures(props.event.id, { [key]: !props.event[key] })
    await refreshPublicBranding()
    emit('saved', t('admin.features.saved'))
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}

// Buzzer: the admin presses it (or any key) once and that key is stored.
const listening = ref(false)
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']

async function saveBuzzerKey(buzzerKey: string | null) {
  busy.value = true
  try {
    await admin.setFeatures(props.event.id, { buzzerKey })
    await refreshPublicBranding()
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
  if (MODIFIERS.includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()
  stopListening()
  void saveBuzzerKey(e.key)
}

function startListening() {
  listening.value = true
  window.addEventListener('keydown', onCaptureKey, true)
}

function stopListening() {
  listening.value = false
  window.removeEventListener('keydown', onCaptureKey, true)
}

onBeforeUnmount(stopListening)
</script>

<template>
  <ul class="divide-y divide-slate-100 px-4 text-sm" data-test="event-features">
    <li v-for="key in FEATURES" :key="key" class="flex items-center justify-between gap-4 py-3">
      <div>
        <p class="font-semibold text-slate-800">
          {{ $t(`admin.features.${key}.label`) }}
        </p>
        <p class="text-slate-600">
          {{ $t(`admin.features.${key}.hint`) }}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="event[key]"
        :aria-label="$t(`admin.features.${key}.label`)"
        :disabled="busy"
        :data-feature="key"
        class="inline-flex h-11 min-w-[56px] shrink-0 items-center justify-center"
        @click="toggle(key)"
      >
        <span class="inline-flex h-6 w-11 items-center rounded-full transition-colors" :class="event[key] ? 'bg-emerald-500' : 'bg-slate-300'">
          <span class="inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform" :class="event[key] ? 'translate-x-5' : 'translate-x-0.5'" />
        </span>
      </button>
    </li>
    <li class="flex flex-wrap items-center justify-between gap-4 py-3" data-test="buzzer-key">
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-slate-800">
          {{ $t('admin.features.buzzerKey.label') }}
        </p>
        <p class="text-slate-600">
          {{ $t('admin.features.buzzerKey.hint') }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <template v-if="listening">
          <span class="font-semibold text-slate-800" role="status">{{ $t('admin.features.buzzerKey.listening') }}</span>
          <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" data-test="buzzer-cancel" @click="stopListening">
            {{ $t('common.dialog.cancel') }}
          </button>
        </template>
        <template v-else>
          <kbd v-if="event.buzzerKey" class="rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-slate-800" data-test="buzzer-current">
            {{ event.buzzerKey === ' ' ? $t('admin.features.buzzerKey.space') : event.buzzerKey }}
          </kbd>
          <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" :disabled="busy" data-test="buzzer-set" @click="startListening">
            {{ event.buzzerKey ? $t('admin.features.buzzerKey.change') : $t('admin.features.buzzerKey.set') }}
          </button>
          <button v-if="event.buzzerKey" type="button" class="min-h-[44px] rounded px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" :disabled="busy" data-test="buzzer-clear" @click="saveBuzzerKey(null)">
            {{ $t('admin.features.buzzerKey.clear') }}
          </button>
        </template>
      </div>
    </li>
  </ul>
</template>
