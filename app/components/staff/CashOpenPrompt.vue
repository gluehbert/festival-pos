<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useCashStore } from '~/stores/cash'
import { useBranding } from '~/composables/useBranding'
import { parseEuroInput } from '~/utils/euro-input'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'

// With drawers switched on, the first cashing of a shift asks for the change
// float right there, so nobody has to know about the cash page beforehand.
// The payment continues once the drawer is open.
const cash = useCashStore()
const { branding } = useBranding()
watch(() => branding.value.cashDrawerEnabled, (on) => { cash.required = on }, { immediate: true })
const input = ref('')
const cents = computed(() => parseEuroInput(input.value))
const field = ref<HTMLInputElement | null>(null)

watch(() => cash.prompting, async (open) => {
  if (!open) return
  input.value = ''
  await nextTick()
  field.value?.focus()
})

async function confirm() {
  if (cents.value === null) return
  if (await cash.open(cents.value)) cash.finishPrompt(true)
}
</script>

<template>
  <ConfirmDialog
    :open="cash.prompting"
    :title="$t('staff.cash.promptTitle')"
    :confirm-label="$t('staff.cash.open')"
    :busy="cash.busy"
    :confirm-disabled="cents === null"
    @confirm="confirm"
    @cancel="cash.finishPrompt(false)"
  >
    <p>{{ $t('staff.cash.promptText') }}</p>
    <p v-if="cash.otherEventName" class="mt-2 font-semibold text-amber-900" role="status">
      {{ $t('staff.cash.otherEvent', { name: cash.otherEventName }) }}
      <NuxtLink to="/staff/cash" class="underline" @click="cash.finishPrompt(false)">
        {{ $t('staff.cash.nav') }}
      </NuxtLink>
    </p>
    <form @submit.prevent="confirm">
      <label class="mt-3 flex items-center justify-between gap-3 font-semibold">
        {{ $t('staff.cash.openingLabel') }}
        <input
          ref="field"
          v-model="input"
          inputmode="decimal"
          class="min-h-[52px] w-36 rounded-lg border-2 border-slate-300 bg-surface px-3 text-2xl font-bold tabular-nums"
          data-test="cash-prompt-opening"
          placeholder="0,00"
        >
      </label>
    </form>
    <p v-if="cash.error" class="mt-2 text-rose-700" role="alert">
      {{ cash.error }}
    </p>
  </ConfirmDialog>
</template>
