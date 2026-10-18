<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { navigateTo } from '#imports'
import { homeForRole, useAuthStore } from '~/stores/auth'

// "Mein Konto": who is signed in, the way to passkeys and, for admins, the own
// password (service, kitchen and bar staff join by link and have none).
const { t } = useI18n()
const auth = useAuthStore()
const back = computed(() => homeForRole(auth.staff?.role))
const isAdmin = computed(() => auth.staff?.role === 'admin')

const MIN_LENGTH = 12
const current = ref('')
const next = ref('')
const repeat = ref('')
const busy = ref(false)
const notice = ref<{ kind: 'success' | 'error'; text: string } | null>(null)

onMounted(async () => {
  if (!auth.isAuthenticated && !(await auth.refresh())) await navigateTo('/staff/login')
})

async function save() {
  notice.value = null
  if (next.value.length < MIN_LENGTH) {
    notice.value = { kind: 'error', text: t('staff.account.tooShort', { n: MIN_LENGTH }) }
    return
  }
  if (next.value !== repeat.value) {
    notice.value = { kind: 'error', text: t('staff.account.mismatch') }
    return
  }
  busy.value = true
  try {
    const res = await auth.changePassword(current.value, next.value)
    notice.value = { kind: res === 'ok' ? 'success' : 'error', text: t(`staff.account.result.${res}`) }
    if (res === 'ok') {
      current.value = ''
      next.value = ''
      repeat.value = ''
    }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-md px-4 py-6">
    <NuxtLink :to="back" class="inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.back') }}
    </NuxtLink>
    <h1 class="text-2xl font-bold text-slate-900">
      {{ $t('staff.account.title') }}
    </h1>
    <p v-if="auth.staff" class="mt-1 text-sm text-slate-600" data-test="account-who">
      {{ $t('staff.account.signedInAs', { name: auth.staff.username, role: $t(`admin.staff.roles.${auth.staff.role}`) }) }}
    </p>

    <section v-if="isAdmin" class="mt-6 rounded-lg border border-slate-200 bg-surface p-4">
      <h2 class="text-base font-semibold text-slate-900">
        {{ $t('staff.account.password') }}
      </h2>
      <p class="mt-1 text-xs text-slate-500">
        {{ $t('staff.account.passwordHint') }}
      </p>
      <form class="mt-3 space-y-3" data-test="password-form" @submit.prevent="save">
        <div>
          <label class="block text-sm font-medium text-slate-700" for="pw-current">{{ $t('staff.account.current') }}</label>
          <input id="pw-current" v-model="current" type="password" autocomplete="current-password" required class="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3">
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700" for="pw-next">{{ $t('staff.account.next', { n: MIN_LENGTH }) }}</label>
          <input id="pw-next" v-model="next" type="password" autocomplete="new-password" required class="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3">
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700" for="pw-repeat">{{ $t('staff.account.repeat') }}</label>
          <input id="pw-repeat" v-model="repeat" type="password" autocomplete="new-password" required class="mt-1 min-h-[44px] w-full rounded border border-slate-300 px-3">
        </div>
        <p
          v-if="notice"
          class="rounded px-3 py-2 text-sm"
          :class="notice.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'"
          :role="notice.kind === 'success' ? 'status' : 'alert'"
          data-test="password-notice"
        >
          {{ notice.text }}
        </p>
        <button type="submit" class="min-h-[48px] w-full rounded bg-primary px-4 font-semibold text-white disabled:opacity-60" :disabled="busy" data-test="password-save">
          {{ $t('staff.account.save') }}
        </button>
      </form>
    </section>

    <NuxtLink
      to="/staff/passkeys"
      class="mt-4 flex min-h-[56px] items-center gap-3 rounded-lg border border-slate-200 bg-surface px-4 hover:bg-slate-100"
      data-test="account-passkeys"
    >
      <UIcon name="i-lucide-fingerprint-pattern" class="size-5 shrink-0 text-slate-500" aria-hidden="true" />
      <span class="flex-1">
        <span class="block font-semibold text-slate-900">{{ $t('nav.passkeys') }}</span>
        <span class="block text-xs text-slate-500">{{ $t('staff.account.passkeysHint') }}</span>
      </span>
      <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-slate-400" aria-hidden="true" />
    </NuxtLink>
  </main>
</template>
