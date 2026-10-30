<script setup lang="ts">
import { ref } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { useBranding } from '~/composables/useBranding'
import type { EventDto } from '~/../server/lib/contracts/admin'
import BuzzerKeys from '~/components/admin/BuzzerKeys.vue'

// Optional features of an event. Off, they take no room on the staff
// screens and the server refuses them.
const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
// The service screen reads the switches from the public branding.
const { refresh: refreshPublicBranding } = useBranding()
const busy = ref(false)
const FEATURES = ['depositEnabled', 'staffMealsEnabled', 'waiterCallsEnabled', 'foodPrepayEnabled'] as const

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
    <BuzzerKeys :event="event" @saved="(m) => emit('saved', m)" @failed="(m) => emit('failed', m)" />
  </ul>
</template>
