<script setup lang="ts">
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { navigateTo, useRoute } from '#imports'
import { useBranding } from '~/composables/useBranding'
import EventInfo from '~/components/guest/EventInfo.vue'
import EventLogo from '~/components/common/EventLogo.vue'

const { t } = useI18n()
const route = useRoute()
const { branding, dates } = useBranding()
// /?table=N is where the table page sends guests that arrived without a QR key.
const tableNo = ref<number | null>(Number(route.query.table) || null)
const pin = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function submit() {
  error.value = null
  if (!tableNo.value || tableNo.value < 1) {
    error.value = t('guest.landing.errorInvalid')
    return
  }
  if (!pin.value.trim()) {
    error.value = t('guest.landing.errorPin')
    return
  }
  submitting.value = true
  try {
    const api = useApi()
    await api.post('/api/session', { tableNo: tableNo.value, pin: pin.value.trim().toUpperCase() })
    await navigateTo(`/t/${tableNo.value}`)
  }
  catch (e: unknown) {
    const data = (e as { data?: { message?: string } })?.data
    const status = (e as { statusCode?: number })?.statusCode
    error.value = status === 403
      ? t('guest.landing.errorWrongPin')
      : status === 429 ? t('guest.landing.errorTooMany') : data?.message ?? t('guest.landing.errorGeneric')
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
    <header class="space-y-2 text-center">
      <EventLogo
        :branding="branding"
        :alt="$t('guest.event.logoAlt', { name: branding.eventName ?? '' })"
        img-class="mx-auto mb-2 max-h-32 w-auto max-w-[70%] object-contain"
      />
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
        {{ branding.eventName ?? $t('guest.landing.kicker') }}
      </p>
      <p v-if="dates" class="text-sm font-medium text-slate-700" data-test="event-dates">
        <span class="sr-only">{{ $t('guest.event.dates') }}: </span>{{ dates }}
      </p>
      <h1 class="text-3xl font-bold text-slate-900">
        {{ $t('guest.landing.title') }}
      </h1>
      <p v-if="branding.welcomeText" class="whitespace-pre-line text-base text-slate-800">
        {{ branding.welcomeText }}
      </p>
      <p class="text-sm text-slate-600">
        {{ $t('guest.landing.description') }}
      </p>
    </header>
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <label for="table-no" class="block text-sm font-medium text-slate-700">
        {{ $t('guest.landing.tableLabel') }}
      </label>
      <input
        id="table-no"
        v-model.number="tableNo"
        type="number"
        min="1"
        inputmode="numeric"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="error ? 'table-no-error' : undefined"
        required
      >
      <label for="event-pin" class="block text-sm font-medium text-slate-700">
        {{ $t('guest.landing.pinLabel') }}
      </label>
      <input
        id="event-pin"
        v-model="pin"
        type="text"
        autocapitalize="characters"
        autocomplete="off"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg uppercase"
        :aria-describedby="error ? 'table-no-error' : 'event-pin-hint'"
        required
      >
      <p id="event-pin-hint" class="text-xs text-slate-500">
        {{ $t('guest.landing.pinHint') }}
      </p>
      <p v-if="error" id="table-no-error" class="text-sm text-red-600" role="alert">
        {{ error }}
      </p>
      <button
        type="submit"
        :disabled="submitting"
        class="w-full rounded-lg bg-brand-gradient px-4 py-3 text-base font-semibold text-brand-contrast disabled:opacity-60"
      >
        {{ submitting ? $t('guest.landing.submitting') : $t('guest.landing.submit') }}
      </button>
    </form>
    <EventInfo :branding="branding" />
  </main>
</template>
