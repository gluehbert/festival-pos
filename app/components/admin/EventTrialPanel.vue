<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { useBranding } from '~/composables/useBranding'
import type { EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
// The rehearsal banner in the layout comes from the public branding.
const { refresh: refreshPublicBranding } = useBranding()
const busy = ref(false)
// Deleting test data is irreversible, so it takes a second click.
const confirming = ref<'end' | 'delete' | null>(null)

const countText = computed(() => t('admin.trial.count', { n: props.event.trialOrders }, props.event.trialOrders))

async function run(action: () => Promise<string>) {
  busy.value = true
  try {
    const text = await action()
    await refreshPublicBranding()
    emit('saved', text)
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
    confirming.value = null
  }
}

function start() {
  void run(async () => {
    await admin.setTrialMode(props.event.id, true)
    return t('admin.trial.started')
  })
}

function end() {
  if (props.event.trialOrders > 0) {
    confirming.value = 'end'
    return
  }
  void run(async () => {
    await admin.setTrialMode(props.event.id, false)
    return t('admin.trial.ended')
  })
}

function confirm() {
  const ending = confirming.value === 'end'
  void run(async () => {
    const res = await admin.deleteTrialData(props.event.id)
    if (ending) {
      await admin.setTrialMode(props.event.id, false)
      return t('admin.trial.ended')
    }
    return t('admin.trial.deleted', { orders: res.deletedOrders, payments: res.deletedPayments })
  })
}
</script>

<template>
  <div class="border-t border-slate-200 px-4 py-3 text-sm" data-test="event-trial">
    <template v-if="event.trialMode">
      <p class="font-semibold text-amber-900">
        {{ $t('admin.trial.running') }} {{ countText }}.
      </p>
    </template>
    <template v-else>
      <p v-if="event.trialOrders > 0" class="text-amber-900">
        {{ $t('admin.trial.leftover', { count: countText }) }}
      </p>
      <p class="text-slate-600">
        {{ $t('admin.trial.startHint') }}
      </p>
    </template>

    <div v-if="confirming" class="mt-2 rounded border border-rose-300 bg-rose-50 p-3" role="alert">
      <p class="text-rose-900">
        {{ $t(confirming === 'end' ? 'admin.trial.confirmEnd' : 'admin.trial.confirmDelete', { count: countText }) }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-[44px] rounded bg-danger px-3 font-semibold text-white disabled:opacity-50"
          :disabled="busy"
          @click="confirm"
        >
          {{ $t(confirming === 'end' ? 'admin.trial.confirmEndButton' : 'admin.trial.confirmDeleteButton') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-slate-800" @click="confirming = null">
          {{ $t('admin.trial.cancel') }}
        </button>
      </div>
    </div>

    <div v-else class="mt-2 flex flex-wrap gap-2">
      <button
        v-if="!event.trialMode"
        type="button"
        class="min-h-[44px] rounded border border-amber-400 bg-amber-50 px-3 font-semibold text-amber-900 disabled:opacity-50"
        :disabled="busy"
        @click="start"
      >
        {{ $t('admin.trial.start') }}
      </button>
      <button
        v-if="event.trialOrders > 0"
        type="button"
        class="min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-800 disabled:opacity-50"
        :disabled="busy"
        @click="confirming = 'delete'"
      >
        {{ $t('admin.trial.deleteData') }}
      </button>
      <button
        v-if="event.trialMode"
        type="button"
        class="min-h-[44px] rounded bg-primary px-3 font-semibold text-white disabled:opacity-50"
        :disabled="busy"
        @click="end"
      >
        {{ $t('admin.trial.end') }}
      </button>
    </div>
  </div>
</template>
