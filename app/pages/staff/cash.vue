<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useCashStore } from '~/stores/cash'
import { useFormat } from '~/composables/useFormat'
import { parseEuroInput } from '~/utils/euro-input'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'
import CashBreakdown from '~/components/staff/CashBreakdown.vue'

const { dateTime } = useFormat()
const auth = useAuthStore()
const cash = useCashStore()

const openingInput = ref('')
const countedInput = ref('')
const note = ref('')
const openingCents = computed(() => parseEuroInput(openingInput.value))
const countedCents = computed(() => parseEuroInput(countedInput.value))
const confirming = ref(false)
const differs = computed(() => cash.session !== null && countedCents.value !== null && countedCents.value !== cash.session.expectedCents)

onMounted(async () => {
  if (!auth.isAuthenticated && !(await auth.refresh())) {
    await navigateTo('/staff/login')
    return
  }
  await cash.load()
})

async function openDrawer() {
  if (openingCents.value === null) return
  if (await cash.open(openingCents.value)) openingInput.value = ''
}

function askClose() {
  if (countedCents.value !== null) confirming.value = true
}

async function closeDrawer() {
  confirming.value = false
  if (countedCents.value === null) return
  if (await cash.close(countedCents.value, note.value.trim() || undefined)) {
    countedInput.value = ''
    note.value = ''
  }
}

const inputClass = 'min-h-[52px] w-40 rounded-lg border-2 border-slate-300 bg-surface px-3 text-2xl font-bold tabular-nums'
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-6">
    <NuxtLink to="/staff" class="inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.back') }}
    </NuxtLink>
    <h1 class="text-2xl font-bold text-slate-900">
      {{ $t('staff.cash.title') }}
    </h1>
    <p class="text-xs text-slate-500" data-test="cash-internal-note">
      {{ $t('staff.cash.internalNote') }}
    </p>

    <p v-if="cash.error" class="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
      {{ cash.error }}
    </p>

    <p v-if="cash.otherEventName" class="mt-3 rounded bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900" role="status" data-test="cash-other-event">
      {{ $t('staff.cash.otherEvent', { name: cash.otherEventName }) }}
    </p>

    <section v-if="cash.lastClosed" class="mt-4 rounded-lg border border-slate-200 bg-surface p-4" aria-live="polite">
      <h2 class="flex items-center gap-2 font-semibold text-slate-900">
        <UIcon name="i-lucide-circle-check" class="size-5 text-emerald-600 shrink-0" aria-hidden="true" /> {{ $t('staff.cash.closedTitle') }}
      </h2>
      <p class="text-xs text-slate-500">
        {{ dateTime(cash.lastClosed.openedAt) }} – {{ dateTime(cash.lastClosed.closedAt) }}
      </p>
      <CashBreakdown class="mt-2" :session="cash.lastClosed" />
    </section>

    <p v-if="cash.loading && !cash.session" class="mt-6 text-sm text-slate-500">
      {{ $t('staff.overview.loading') }}
    </p>

    <section v-else-if="cash.session" class="mt-4 space-y-4">
      <div class="rounded-lg border border-slate-200 bg-surface p-4">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs text-slate-500">
            {{ $t('staff.cash.openSince', { time: dateTime(cash.session.openedAt) }) }}
          </p>
          <button type="button" class="min-h-[44px] rounded-lg px-3 text-sm text-brand-ink hover:bg-slate-100" @click="cash.load()">
            {{ $t('staff.cash.refresh') }}
          </button>
        </div>
        <CashBreakdown :session="cash.session" :counted-cents="countedCents" />
      </div>

      <form class="space-y-3 rounded-lg border border-slate-200 bg-surface p-4" @submit.prevent="askClose">
        <label class="flex items-center justify-between gap-3 font-semibold">
          {{ $t('staff.cash.countedLabel') }}
          <input v-model="countedInput" inputmode="decimal" :class="inputClass" data-test="cash-counted" placeholder="0,00">
        </label>
        <label class="block text-sm">
          {{ $t('staff.cash.noteLabel') }}
          <input v-model="note" maxlength="200" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-surface px-3">
        </label>
        <button
          type="submit"
          class="min-h-[52px] w-full rounded-lg bg-primary font-semibold text-white disabled:opacity-50"
          :disabled="countedCents === null || cash.busy"
        >
          {{ $t('staff.cash.close') }}
        </button>
      </form>
    </section>

    <form v-else class="mt-4 space-y-3 rounded-lg border border-slate-200 bg-surface p-4" @submit.prevent="openDrawer">
      <p class="text-sm text-slate-600">
        {{ $t('staff.cash.openHint') }}
      </p>
      <label class="flex items-center justify-between gap-3 font-semibold">
        {{ $t('staff.cash.openingLabel') }}
        <input v-model="openingInput" inputmode="decimal" :class="inputClass" data-test="cash-opening" placeholder="0,00">
      </label>
      <button
        type="submit"
        class="min-h-[52px] w-full rounded-lg bg-brand-gradient font-semibold text-brand-contrast disabled:opacity-50"
        :disabled="openingCents === null || cash.busy"
      >
        {{ $t('staff.cash.open') }}
      </button>
    </form>

    <ConfirmDialog
      :open="confirming"
      :title="$t('staff.cash.closeTitle')"
      :confirm-label="$t('staff.cash.close')"
      :danger="differs"
      :busy="cash.busy"
      @confirm="closeDrawer"
      @cancel="confirming = false"
    >
      <CashBreakdown v-if="cash.session" :session="cash.session" :counted-cents="countedCents" />
      <p class="mt-2 text-slate-500">
        {{ $t('staff.cash.confirmClose') }}
      </p>
    </ConfirmDialog>
  </main>
</template>
