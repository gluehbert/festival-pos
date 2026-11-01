<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { navigateTo } from '#imports'
import { homeForRole, useAuthStore } from '~/stores/auth'
import { usePasskeysStore } from '~/stores/passkeys'
import { useFormat } from '~/composables/useFormat'
import ConfirmDialog from '~/components/common/ConfirmDialog.vue'
import { devicePlatform, markPasskeyOffer, passkeyErrorKey, passkeysSupported } from '~/utils/passkey'

// "Meine Passkeys": set up, list and remove the own passkeys.
const { t } = useI18n()
const auth = useAuthStore()
const store = usePasskeysStore()
const { dateTime } = useFormat()

const supported = ref(true)
const name = ref('')
const busy = ref(false)
const notice = ref<{ kind: 'success' | 'error'; text: string } | null>(null)

const sharedDevice = computed(() => auth.staff?.role === 'kitchen' || auth.staff?.role === 'bar' || auth.staff?.role === 'cafe')
const back = computed(() => homeForRole(auth.staff?.role))

onMounted(async () => {
  if (!auth.isAuthenticated && !(await auth.refresh())) {
    await navigateTo('/staff/login')
    return
  }
  supported.value = passkeysSupported()
  name.value = t('staff.passkeys.defaultName', { device: devicePlatform(), name: auth.staff?.username ?? '' })
  try {
    await store.fetchAll()
  }
  catch {
    notice.value = { kind: 'error', text: t('staff.passkeys.loadFailed') }
  }
})

async function add() {
  if (!auth.staff) return
  notice.value = null
  busy.value = true
  try {
    await store.add(name.value.trim() || devicePlatform())
    markPasskeyOffer(auth.staff.username, 'done')
    notice.value = { kind: 'success', text: t('staff.passkeys.added') }
  }
  catch (e) {
    const key = passkeyErrorKey(e)
    if (key === 'alreadyRegistered') markPasskeyOffer(auth.staff.username, 'done')
    if (key !== 'cancelled') notice.value = { kind: 'error', text: t(`staff.passkeys.error.${key}`) }
  }
  finally {
    busy.value = false
  }
}

const removing = ref<{ id: string, name: string } | null>(null)

async function remove() {
  const target = removing.value
  if (!target) return
  removing.value = null
  busy.value = true
  try {
    await store.remove(target.id)
    notice.value = { kind: 'success', text: t('staff.passkeys.removed') }
  }
  catch {
    notice.value = { kind: 'error', text: t('staff.passkeys.removeFailed') }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-6">
    <NuxtLink :to="back" class="inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-500">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.detail.back') }}
    </NuxtLink>
    <h1 class="text-2xl font-bold text-slate-900">
      {{ $t('staff.passkeys.title') }}
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      {{ $t('staff.passkeys.intro') }}
    </p>

    <p v-if="sharedDevice" class="mt-3 flex gap-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900" data-test="shared-device-hint">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.passkeys.sharedHint') }}
    </p>
    <p v-else class="mt-3 text-xs text-slate-500">
      {{ $t('staff.passkeys.sharedHintShort') }}
    </p>

    <p v-if="notice" class="mt-3 rounded px-3 py-2 text-sm" :class="notice.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'" :role="notice.kind === 'success' ? 'status' : 'alert'">
      {{ notice.text }}
    </p>

    <p v-if="!supported" class="mt-4 rounded bg-slate-100 px-3 py-2 text-sm text-slate-700" data-test="passkey-unsupported">
      {{ $t('staff.passkeys.unsupported') }}
    </p>
    <form v-else class="mt-4 space-y-2" @submit.prevent="add">
      <label class="block text-sm font-medium text-slate-700" for="passkey-name">{{ $t('staff.passkeys.name') }}</label>
      <input id="passkey-name" v-model="name" maxlength="60" class="w-full rounded border border-slate-300 px-3 py-2">
      <button
        type="submit"
        class="flex w-full min-h-[52px] items-center justify-center gap-2 rounded bg-brand-gradient px-4 py-3 font-semibold text-brand-contrast disabled:bg-slate-300 disabled:bg-none"
        :disabled="busy"
        data-test="passkey-add"
      >
        <UIcon name="i-lucide-fingerprint-pattern" class="size-5 shrink-0" aria-hidden="true" /> {{ $t('staff.passkeys.add') }}
      </button>
    </form>

    <section class="mt-6">
      <h2 class="mb-2 text-sm font-semibold text-slate-700">
        {{ $t('staff.passkeys.list') }}
      </h2>
      <p v-if="!store.loading && store.passkeys.length === 0" class="text-sm text-slate-500">
        {{ $t('staff.passkeys.empty') }}
      </p>
      <ul v-else class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-surface px-3">
        <li v-for="p in store.passkeys" :key="p.id" class="flex items-center gap-3 py-3" data-test="passkey-row">
          <UIcon name="i-lucide-key-round" class="size-5 shrink-0 text-slate-500" aria-hidden="true" />
          <span class="flex-1">
            <span class="block font-medium">{{ p.name }}</span>
            <span class="block text-xs text-slate-500">
              {{ p.lastUsedAt ? $t('staff.passkeys.lastUsed', { at: dateTime(p.lastUsedAt) }) : $t('staff.passkeys.createdAt', { at: dateTime(p.createdAt) }) }}
            </span>
          </span>
          <button
            type="button"
            class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-rose-700 hover:bg-rose-50"
            :aria-label="$t('staff.passkeys.remove', { name: p.name })"
            :disabled="busy"
            @click="removing = { id: p.id, name: p.name }"
          >
            <UIcon name="i-lucide-trash" class="size-5 shrink-0" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      :open="removing !== null"
      :title="$t('staff.passkeys.removeTitle')"
      :confirm-label="$t('staff.passkeys.removeAction')"
      danger
      @confirm="remove"
      @cancel="removing = null"
    >
      {{ $t('staff.passkeys.confirmRemove', { name: removing?.name ?? '' }) }}
    </ConfirmDialog>
  </main>
</template>
