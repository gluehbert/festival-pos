<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApi } from '~/composables/useApi'
import { usePolling } from '~/composables/usePolling'
import { apiError } from '~/utils/api-error'
import type { CallReason, TableCall } from '~/../server/lib/contracts/waiter-calls'

// "Call the service": the guest picks a reason, the table's waiter (then
// everyone in service and the bar screen) sees it. While a call is going on,
// the page asks every 8 s whether someone is coming.
const REASONS: readonly CallReason[] = ['pay', 'order', 'question']

const api = useApi()
const call = ref<TableCall>(null)
const choosing = ref(false)
const busy = ref(false)
const error = ref<'tooSoon' | 'failed' | null>(null)

const polling = usePolling(async () => {
  call.value = await api.get<TableCall>('/api/waiter-calls/table')
  return call.value
}, { intervalMs: 8000 })
// Nothing going on: no need to keep asking.
watch(call, (c) => {
  if (!c) polling.stop()
})

async function send(reason: CallReason) {
  busy.value = true
  error.value = null
  try {
    call.value = await api.post<TableCall>('/api/waiter-calls', { reason })
    choosing.value = false
    polling.start()
  }
  catch (e) {
    error.value = apiError(e).code === 'RATE_LIMITED' ? 'tooSoon' : 'failed'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded-lg border border-slate-200 bg-surface p-3" aria-live="polite" data-test="call-waiter">
    <p v-if="call && call.acknowledged" class="flex items-center gap-2 font-semibold text-emerald-800" data-test="call-coming">
      <UIcon name="i-lucide-footprints" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t('guest.call.coming') }}
    </p>
    <p v-else-if="call" class="flex items-center gap-2 font-semibold text-slate-900" data-test="call-waiting">
      <UIcon name="i-lucide-bell-ring" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t('guest.call.waiting', { reason: $t(`guest.call.reasons.${call.reason}`) }) }}
    </p>
    <template v-else-if="choosing">
      <p class="text-sm font-semibold text-slate-900">
        {{ $t('guest.call.ask') }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="r in REASONS"
          :key="r"
          type="button"
          class="min-h-[44px] rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-50"
          :disabled="busy"
          :data-reason="r"
          @click="send(r)"
        >
          {{ $t(`guest.call.reasons.${r}`) }}
        </button>
        <button type="button" class="min-h-[44px] rounded-lg px-4 text-slate-700 hover:bg-slate-100" @click="choosing = false">
          {{ $t('guest.call.cancel') }}
        </button>
      </div>
    </template>
    <button
      v-else
      type="button"
      class="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-4 font-semibold text-slate-900"
      data-test="call-open"
      @click="choosing = true"
    >
      <UIcon name="i-lucide-hand" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t('guest.call.button') }}
    </button>
    <p v-if="error" class="mt-2 text-sm text-rose-600" role="alert">
      {{ $t(`guest.call.${error}`) }}
    </p>
  </section>
</template>
