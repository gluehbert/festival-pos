<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useCashStore } from '~/stores/cash'
import { useApi } from '~/composables/useApi'
import { useFormat } from '~/composables/useFormat'

// Deposit return (Pfand): count returned glasses per deposit value and pay them out.
const { t } = useI18n()
const { euro } = useFormat()
const auth = useAuthStore()
const cash = useCashStore()

const units = ref<number[]>([])
const counts = ref<Record<number, number>>({})
const notice = ref<string | null>(null)
const loaded = ref(false)

const totalCents = computed(() => units.value.reduce((s, u) => s + u * (counts.value[u] ?? 0), 0))

function set(unit: number, n: number) {
  notice.value = null
  counts.value = { ...counts.value, [unit]: Math.max(0, Math.min(200, n)) }
}

onMounted(async () => {
  if (!auth.isAuthenticated && !(await auth.refresh())) {
    await navigateTo('/staff/login')
    return
  }
  try {
    units.value = (await useApi().get<{ units: number[] }>('/api/deposit-returns/options')).units
  }
  catch {
    cash.error = t('staff.deposit.loadFailed')
  }
  loaded.value = true
})

async function payOut() {
  if (totalCents.value <= 0) return
  const booked = await cash.returnDeposit(counts.value)
  if (booked === null) return
  notice.value = t('staff.deposit.done', { amount: euro(-booked) })
  counts.value = {}
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-6">
    <NuxtLink to="/staff" class="inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.back') }}
    </NuxtLink>
    <h1 class="text-2xl font-bold text-slate-900">
      {{ $t('staff.deposit.title') }}
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ $t('staff.deposit.hint') }}
    </p>

    <p v-if="notice" class="mt-3 flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
      <UIcon name="i-lucide-circle-check" class="size-4 shrink-0" aria-hidden="true" /> {{ notice }}
    </p>
    <p v-if="cash.error" class="mt-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
      {{ cash.error }}
    </p>
    <p v-if="loaded && units.length === 0" class="mt-6 text-sm text-slate-500">
      {{ $t('staff.deposit.none') }}
    </p>

    <ul v-else class="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-surface px-3">
      <li v-for="u in units" :key="u" class="flex items-center gap-3 py-3" data-test="deposit-unit">
        <span class="flex-1 font-medium">{{ $t('staff.deposit.unit', { amount: euro(u) }) }}</span>
        <button
          type="button"
          class="h-11 w-11 rounded-lg border border-slate-300 text-xl font-bold disabled:opacity-40"
          :disabled="!counts[u]"
          :aria-label="$t('staff.deposit.less', { amount: euro(u) })"
          @click="set(u, (counts[u] ?? 0) - 1)"
        >
          −
        </button>
        <span class="w-10 text-center text-lg font-bold tabular-nums">{{ counts[u] ?? 0 }}</span>
        <button
          type="button"
          class="h-11 w-11 rounded-lg border border-slate-300 text-xl font-bold"
          :aria-label="$t('staff.deposit.more', { amount: euro(u) })"
          @click="set(u, (counts[u] ?? 0) + 1)"
        >
          +
        </button>
      </li>
    </ul>

    <button
      v-if="units.length > 0"
      type="button"
      class="mt-4 min-h-[56px] w-full rounded-lg bg-primary text-lg font-bold text-white disabled:opacity-50"
      :disabled="totalCents <= 0 || cash.busy"
      data-test="deposit-pay"
      @click="payOut"
    >
      {{ $t('staff.deposit.payOut', { amount: euro(-totalCents) }) }}
    </button>
  </main>
</template>
