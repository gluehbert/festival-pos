<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApi } from '~/composables/useApi'
import { usePolling } from '~/composables/usePolling'
import { useAttention } from '~/composables/useAttention'
import { useAuthStore } from '~/stores/auth'
import { createSeenTracker } from '~/utils/arrivals'
import type { OpenCall, OpenCalls } from '~/../server/lib/contracts/waiter-calls'

// Tables calling for the service. A waiter sees the calls of their own
// tables, and every call nobody answered in time or nobody holds the table
// for; the shift lead, the admin and the bar screen see all of them.
const props = defineProps<{ bar?: boolean }>()

const api = useApi()
const auth = useAuthStore()
const calls = ref<OpenCall[]>([])
const busy = ref<string[]>([])

usePolling(async () => {
  calls.value = (await api.get<OpenCalls>('/api/waiter-calls')).calls
  return calls.value
}, { intervalMs: 5000, maxBackoffMs: 30_000 })

const seesAll = computed(() => props.bar || auth.hasRole(['lead', 'admin']))
const shown = computed(() => calls.value.filter((c) => seesAll.value || c.escalated || c.assignee?.staffId === auth.staff?.staffId))

// A call newly shown here (also one that just reached everyone): tone + vibration.
const attention = useAttention()
const seen = createSeenTracker()
watch(shown, (list) => {
  if (seen.update(list.map((c) => `${c.id}:${c.escalated}`)).length > 0) attention.notify()
})

async function answer(id: string) {
  busy.value = [...busy.value, id]
  try {
    await api.post(`/api/waiter-calls/${id}/ack`, {})
    calls.value = calls.value.filter((c) => c.id !== id)
  }
  catch { /* still listed, the next poll shows the current state */ }
  finally {
    busy.value = busy.value.filter((b) => b !== id)
  }
}
</script>

<template>
  <section v-if="shown.length > 0" class="mt-4 rounded-lg border-2 border-rose-400 bg-rose-50 p-3 text-rose-950" data-test="waiter-calls">
    <h2 class="flex items-center gap-1 text-base font-bold">
      <UIcon name="i-lucide-bell-ring" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t('staff.calls.heading') }}
    </h2>
    <ul class="mt-2 space-y-2">
      <li v-for="c in shown" :key="c.id" class="flex flex-wrap items-center justify-between gap-2" data-test="waiter-call">
        <div>
          <p class="text-lg font-bold">
            {{ $t('staff.calls.table', { table: c.tableNo }) }} · {{ $t(`guest.call.reasons.${c.reason}`) }}
          </p>
          <p class="text-sm">
            {{ c.waitingSeconds < 60 ? $t('staff.calls.justNow') : $t('staff.calls.waiting', { min: Math.floor(c.waitingSeconds / 60) }) }}
            · {{ c.assignee ? c.assignee.username : $t('staff.calls.nobody') }}
          </p>
        </div>
        <button
          type="button"
          class="min-h-[48px] rounded-lg bg-rose-700 px-4 font-semibold text-white disabled:opacity-50"
          :disabled="busy.includes(c.id)"
          @click="answer(c.id)"
        >
          {{ bar ? $t('staff.calls.passedOn') : $t('staff.calls.onMyWay') }}
        </button>
      </li>
    </ul>
  </section>
</template>
