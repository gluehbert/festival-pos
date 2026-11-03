<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  open: boolean
  itemName: string
  submitting?: boolean
  error?: string | null
  /** Server error code; known codes get a readable message. */
  errorCode?: string | null
  /** Refund mode: same dialog, different wording. */
  refund?: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'confirm', reason: string): void
  (e: 'cancel'): void
}>()

const reason = ref('')
watch(
  () => props.open,
  (v) => {
    if (v) reason.value = ''
  },
)

const { t } = useI18n()
const CODE_KEYS: Record<string, string> = {
  VOID_ADMIN_ONLY: 'staff.void.errorAdminOnly',
  VOID_PAID: 'staff.void.errorPaid',
  VOID_CANCELLED: 'staff.void.errorCancelled',
  CONFLICT: 'staff.void.errorConflict',
  NOT_FOUND: 'staff.void.errorNotFound',
}
const message = computed(() => {
  if (!props.error && !props.errorCode) return null
  const key = props.errorCode ? CODE_KEYS[props.errorCode] : undefined
  return key ? t(key) : props.error
})

function submit() {
  if (reason.value.trim().length < 3) return
  emit('confirm', reason.value.trim())
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="void-title"
  >
    <div class="w-full max-w-sm rounded-lg bg-surface p-4 shadow-xl">
      <h2 id="void-title" class="text-lg font-semibold text-slate-900">
        {{ refund ? $t('staff.refund.title') : $t('staff.void.title') }}
      </h2>
      <p class="mt-1 text-sm text-slate-600">
        {{ itemName }}
      </p>
      <p v-if="refund" class="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
        {{ $t('staff.refund.hint') }}
      </p>
      <label class="mt-3 block text-sm font-medium text-slate-700" for="void-reason">
        {{ $t('staff.void.reason') }}
      </label>
      <textarea
        id="void-reason"
        v-model="reason"
        rows="3"
        class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
      />
      <!-- Someone ordered for a table and walked on: one tap, same wording in the report. -->
      <button
        v-if="!refund"
        type="button"
        class="mt-1 min-h-[44px] rounded-full border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-100"
        data-test="void-not-ordered"
        @click="reason = $t('staff.void.notOrdered')"
      >
        {{ $t('staff.void.notOrdered') }}
      </button>
      <p v-if="refund && errorCode === 'CASH_SESSION_REQUIRED'" class="mt-2 text-sm text-rose-600" role="alert">
        {{ $t('staff.refund.needsDrawer') }}
        <NuxtLink to="/staff/cash" class="font-semibold underline">
          {{ $t('staff.refund.toCash') }}
        </NuxtLink>
      </p>
      <p v-else-if="message" class="mt-2 text-sm text-rose-600" role="alert">
        {{ message }}
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="min-h-[44px] rounded px-4 text-sm text-slate-700 hover:bg-slate-100" @click="emit('cancel')">
          {{ $t('staff.void.cancel') }}
        </button>
        <button
          type="button"
          class="min-h-[44px] rounded bg-danger px-4 text-sm font-semibold text-white disabled:bg-slate-300"
          :disabled="reason.trim().length < 3 || submitting"
          @click="submit"
        >
          {{ refund ? $t('staff.refund.confirm') : $t('staff.void.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>
