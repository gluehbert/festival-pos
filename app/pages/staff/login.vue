<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { navigateTo, useRuntimeConfig } from '#imports'
import { homeForRole, useAuthStore } from '~/stores/auth'
import { loadLoginPrefs, loginErrorKey, saveLoginPrefs, type LoginKind } from '~/utils/login'
import { markPasskeyOffer, passkeyErrorKey, passkeysSupported } from '~/utils/passkey'
import PreviewLogin from '~/components/staff/PreviewLogin.vue'

const { t } = useI18n()
const auth = useAuthStore()
const username = ref('')
const secret = ref('')
const kind = ref<LoginKind>('password')
const reveal = ref(false)
const submitting = ref(false)
const err = ref<string | null>(null)
const canPasskey = ref(false)
const previewLogin = useRuntimeConfig().public.previewLogin

onMounted(() => {
  canPasskey.value = passkeysSupported()
  const prefs = loadLoginPrefs()
  if (!prefs) return
  kind.value = prefs.kind
  if (!username.value) username.value = prefs.username
})
watch(kind, () => { reveal.value = false })

async function submit() {
  err.value = null
  submitting.value = true
  try {
    const session = await auth.login({ username: username.value, secret: secret.value, kind: kind.value })
    saveLoginPrefs({ kind: kind.value, username: username.value.trim() })
    await navigateTo(homeForRole(session?.role))
  }
  catch (e: unknown) {
    err.value = t(`staff.login.${loginErrorKey(e)}`)
  }
  finally {
    submitting.value = false
  }
}

async function submitPasskey() {
  err.value = null
  submitting.value = true
  try {
    const session = await auth.loginWithPasskey()
    saveLoginPrefs({ kind: kind.value, username: session.username })
    // Works here already: no need to offer setting one up.
    markPasskeyOffer(session.username, 'done')
    await navigateTo(homeForRole(session.role))
  }
  catch (e: unknown) {
    const key = passkeyErrorKey(e)
    if (key !== 'cancelled') err.value = t(`staff.login.${key === 'alreadyRegistered' ? 'errorInvalid' : key}`)
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-sm px-4 py-10">
    <h1 class="text-2xl font-bold text-slate-900">
      {{ $t('staff.login.title') }}
    </h1>
    <div v-if="canPasskey" class="mt-6">
      <button
        type="button"
        class="flex w-full min-h-[52px] items-center justify-center gap-2 rounded border-2 border-brand px-4 py-3 font-semibold text-brand-ink disabled:opacity-50"
        :disabled="submitting"
        data-test="passkey-login"
        @click="submitPasskey"
      >
        <UIcon name="i-lucide-fingerprint-pattern" class="size-5 shrink-0" aria-hidden="true" />
        {{ $t('staff.login.passkey') }}
      </button>
      <p class="mt-1 text-center text-xs text-slate-500">
        {{ $t('staff.login.passkeyHint') }}
      </p>
      <p class="mt-4 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500" aria-hidden="true">
        <span class="h-px flex-1 bg-slate-200" />{{ $t('staff.login.or') }}<span class="h-px flex-1 bg-slate-200" />
      </p>
    </div>
    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <div>
        <label class="block text-sm font-medium text-slate-700" for="username">
          {{ $t('staff.login.username') }}
        </label>
        <input
          id="username"
          v-model="username"
          required
          autocomplete="username"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
      </div>
      <fieldset class="space-y-1">
        <legend class="text-sm font-medium text-slate-700">
          {{ $t('staff.login.kind') }}
        </legend>
        <label class="inline-flex min-h-[44px] items-center gap-2 text-sm">
          <input v-model="kind" type="radio" value="password" class="size-5"> {{ $t('staff.login.password') }}
        </label>
        <label class="ml-4 inline-flex min-h-[44px] items-center gap-2 text-sm">
          <input v-model="kind" type="radio" value="pin" class="size-5"> {{ $t('staff.login.pin') }}
        </label>
      </fieldset>
      <div>
        <label class="block text-sm font-medium text-slate-700" for="secret">
          {{ kind === 'pin' ? $t('staff.login.pin') : $t('staff.login.password') }}
        </label>
        <div class="relative mt-1">
          <input
            id="secret"
            v-model="secret"
            required
            :type="reveal ? 'text' : 'password'"
            :inputmode="kind === 'pin' ? 'numeric' : 'text'"
            :pattern="kind === 'pin' ? '[0-9]*' : undefined"
            minlength="4"
            autocomplete="current-password"
            class="w-full rounded border border-slate-300 py-2 pl-3 pr-12"
          >
          <button
            type="button"
            class="absolute inset-y-0 right-0 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-slate-500 hover:bg-slate-100"
            :aria-label="reveal ? $t('staff.login.hideSecret') : $t('staff.login.showSecret')"
            :aria-pressed="reveal"
            data-test="toggle-secret"
            @click="reveal = !reveal"
          >
            <UIcon :name="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-5 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p v-if="err" class="text-sm text-rose-600" role="alert">
        {{ err }}
      </p>
      <button
        type="submit"
        class="w-full rounded bg-brand-gradient px-4 py-3 font-semibold text-brand-contrast disabled:bg-slate-300 disabled:bg-none"
        :disabled="submitting"
      >
        {{ submitting ? $t('staff.login.submitting') : $t('staff.login.submit') }}
      </button>
    </form>
    <PreviewLogin v-if="previewLogin" />
  </main>
</template>
