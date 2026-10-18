<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useFormat } from '~/composables/useFormat'

interface Props {
  selectedCents: number
  totalCents: number
  submitting?: boolean
  disabled?: boolean
  /** Units chosen; a selection of only 0-€ items closes them without cash. */
  selectedUnits?: number
}
const props = defineProps<Props>()
const hasSelection = computed(() => (props.selectedUnits ?? (props.selectedCents > 0 ? 1 : 0)) > 0)
const free = computed(() => hasSelection.value && props.selectedCents === 0)
const emit = defineEmits<{ (e: 'submit', givenCents: number | null): void }>()

const { euro } = useFormat()
const selectedEur = computed(() => euro(props.selectedCents))
const totalEur = computed(() => euro(props.totalCents))

// Change calculator only, nothing is stored. Accepts "20" or "20,50".
const given = ref('')
const givenCents = computed(() => {
  const n = Number.parseFloat(given.value.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : null
})
const changeCents = computed(() =>
  givenCents.value !== null && givenCents.value >= props.selectedCents ? givenCents.value - props.selectedCents : null,
)

// Two taps on the same spot: the first arms "{amount} kassieren?", the
// second books. A short guard stops an accidental double tap from doing
// both; after a while without the second tap it disarms by itself.
const ARM_GUARD_MS = 400
const ARM_TIMEOUT_MS = 6000
const armed = ref(false)
const guarding = ref(false)
let guardTimer: ReturnType<typeof setTimeout> | null = null
let disarmTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (guardTimer) clearTimeout(guardTimer)
  if (disarmTimer) clearTimeout(disarmTimer)
  guardTimer = disarmTimer = null
}

function disarm() {
  clearTimers()
  armed.value = false
  guarding.value = false
}

function tap() {
  if (!armed.value) {
    armed.value = true
    guarding.value = true
    guardTimer = setTimeout(() => { guarding.value = false }, ARM_GUARD_MS)
    disarmTimer = setTimeout(disarm, ARM_TIMEOUT_MS)
    return
  }
  const cents = givenCents.value
  disarm()
  emit('submit', cents)
}

watch(() => props.selectedCents, () => {
  given.value = ''
  disarm()
})
watch(() => props.disabled, (d) => { if (d) disarm() })
onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="rounded-lg border border-slate-200 bg-surface p-4 shadow-sm">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs text-slate-500">
          {{ $t('staff.pay.selection') }}
        </p>
        <p class="text-2xl font-bold text-slate-900">
          {{ selectedEur }}
        </p>
      </div>
      <div class="text-right text-xs text-slate-500">
        {{ $t('staff.pay.openTotal') }}<br>
        <span class="font-mono text-slate-700">{{ totalEur }}</span>
      </div>
    </div>
    <div v-if="selectedCents > 0" class="mt-3 flex items-center gap-3">
      <label class="flex items-center gap-2 text-sm text-slate-600">
        {{ $t('staff.pay.given') }}
        <input
          v-model="given"
          type="text"
          inputmode="decimal"
          class="min-h-[44px] w-24 rounded border border-slate-300 px-2 py-2 text-right text-base"
          data-test="pay-given"
        >
      </label>
      <p v-if="changeCents !== null" class="ml-auto text-lg font-bold text-emerald-700" data-test="pay-change">
        {{ $t('staff.pay.change', { amount: euro(changeCents) }) }}
      </p>
    </div>
    <div class="mt-3 flex gap-2">
      <button
        v-if="armed"
        type="button"
        class="min-h-[44px] rounded px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        data-test="pay-cancel"
        @click="disarm"
      >
        {{ $t('staff.pay.cancel') }}
      </button>
      <button
        type="button"
        class="min-h-[52px] flex-1 rounded px-4 py-3 text-base font-semibold shadow disabled:cursor-not-allowed disabled:bg-slate-300"
        :class="armed ? 'bg-success text-white hover:bg-success-hover' : 'bg-brand text-brand-contrast'"
        :disabled="disabled || submitting || !hasSelection || guarding"
        data-test="pay-submit"
        @click="tap"
      >
        <template v-if="submitting">
          {{ $t('staff.login.submitting') }}
        </template>
        <template v-else-if="free">
          {{ $t('staff.pay.submitFree') }}
        </template>
        <template v-else-if="armed">
          {{ $t('staff.pay.confirm', { amount: selectedEur }) }}
        </template>
        <template v-else>
          {{ $t('staff.pay.submit', { amount: selectedEur }) }}
        </template>
      </button>
    </div>
  </div>
</template>
