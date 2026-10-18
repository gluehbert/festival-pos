<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { usePasskeysStore } from '~/stores/passkeys'
import { devicePlatform, markPasskeyOffer, passkeyErrorKey, shouldOfferPasskey } from '~/utils/passkey'

// After a PIN/password login: "next time without a PIN?" Once per user and
// device, never on the shared kitchen/bar tablets (utils/passkey.ts), and it
// never blocks the work: "Later" hides it until the next login.
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const passkeys = usePasskeysStore()

const mounted = ref(false)
const answered = ref<string | null>(null) // username the offer was answered for in this tab
const busy = ref(false)
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null)

onMounted(() => { mounted.value = true })

const visible = computed(() => {
  const s = auth.staff
  if (!mounted.value || !s) return false
  if (message.value) return true
  if (answered.value === s.username) return false
  if (!/^\/(staff|admin|production)(\/|$)/.test(route.path) || route.path.startsWith('/staff/passkeys') || route.path === '/staff/login') return false
  return shouldOfferPasskey(s.username, s.role)
})

async function setUp() {
  const s = auth.staff
  if (!s) return
  busy.value = true
  try {
    await passkeys.add(t('staff.passkeys.defaultName', { device: devicePlatform(), name: s.username }))
    markPasskeyOffer(s.username, 'done')
    message.value = { kind: 'success', text: t('staff.passkeys.added') }
    setTimeout(() => { message.value = null }, 4000)
  }
  catch (e) {
    const key = passkeyErrorKey(e)
    if (key === 'alreadyRegistered') markPasskeyOffer(s.username, 'done')
    if (key !== 'cancelled') message.value = { kind: 'error', text: t(`staff.passkeys.error.${key}`) }
  }
  finally {
    busy.value = false
    answered.value = s.username
  }
}

function later() {
  answered.value = auth.staff?.username ?? null
}

function never() {
  if (auth.staff) markPasskeyOffer(auth.staff.username, 'never')
  answered.value = auth.staff?.username ?? null
}
</script>

<template>
  <div v-if="visible" class="border-b border-slate-200 bg-surface px-4 py-3" data-test="passkey-offer">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
      <p v-if="message" class="flex-1 text-sm" :class="message.kind === 'success' ? 'text-emerald-800' : 'text-rose-700'" :role="message.kind === 'success' ? 'status' : 'alert'">
        {{ message.text }}
      </p>
      <template v-else>
        <UIcon name="i-lucide-fingerprint-pattern" class="size-6 shrink-0 text-brand-ink" aria-hidden="true" />
        <p class="min-w-48 flex-1 text-sm text-slate-800">
          <span class="font-semibold">{{ $t('staff.passkeys.offerTitle') }}</span>
          {{ $t('staff.passkeys.offerText') }}
        </p>
        <button type="button" class="min-h-[44px] rounded bg-brand px-4 font-semibold text-brand-contrast disabled:bg-slate-300" :disabled="busy" data-test="passkey-offer-setup" @click="setUp">
          {{ $t('staff.passkeys.add') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-sm" :disabled="busy" data-test="passkey-offer-later" @click="later">
          {{ $t('staff.passkeys.later') }}
        </button>
        <button type="button" class="min-h-[44px] rounded px-3 text-sm text-slate-600 hover:bg-slate-100" :disabled="busy" data-test="passkey-offer-never" @click="never">
          {{ $t('staff.passkeys.never') }}
        </button>
      </template>
    </div>
  </div>
</template>
