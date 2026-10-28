<script setup lang="ts">
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'
import type { EndGuestSessionsResponse } from '~/../server/lib/contracts/tables'

// "Shift over": phones that scanned a table QR code earlier can no longer
// order until they scan it again at the table. Bills stay as they are.
const asking = ref(false)
const busy = ref(false)
const result = ref<{ ok: boolean; ended: number } | null>(null)

async function endShift() {
  busy.value = true
  try {
    const res = await useApi().post<EndGuestSessionsResponse>('/api/tickets/guest-sessions/end', {})
    result.value = { ok: true, ended: res.ended }
  }
  catch {
    result.value = { ok: false, ended: 0 }
  }
  finally {
    busy.value = false
    asking.value = false
  }
}
</script>

<template>
  <section class="mt-8 border-t border-slate-200 pt-4" data-test="shift-end">
    <h2 class="text-base font-semibold text-slate-900">
      {{ $t('staff.shiftEnd.title') }}
    </h2>
    <p class="mt-1 text-sm text-slate-600">
      {{ $t('staff.shiftEnd.hint') }}
    </p>
    <button
      type="button"
      class="mt-3 min-h-[44px] rounded border border-slate-300 bg-surface px-4 text-sm font-semibold text-slate-900 hover:bg-slate-100"
      :disabled="busy"
      @click="asking = true"
    >
      {{ $t('staff.shiftEnd.button') }}
    </button>
    <p v-if="result" class="mt-2 text-sm" :class="result.ok ? 'text-emerald-700' : 'text-red-700'" :role="result.ok ? 'status' : 'alert'">
      {{ result.ok ? $t('staff.shiftEnd.done', { n: result.ended }, result.ended) : $t('staff.shiftEnd.failed') }}
    </p>
    <ConfirmDialog
      :open="asking"
      :title="$t('staff.shiftEnd.confirmTitle')"
      :confirm-label="$t('staff.shiftEnd.button')"
      :busy="busy"
      @confirm="endShift"
      @cancel="asking = false"
    >
      {{ $t('staff.shiftEnd.confirmBody') }}
    </ConfirmDialog>
  </section>
</template>
