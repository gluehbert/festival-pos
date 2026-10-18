<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { navigateTo } from '#imports'
import { homeForRole, useAuthStore, type StaffRole } from '~/stores/auth'
import { useStaffJoinStore, type JoinError } from '~/stores/staff-join'

// Join by link: type a name, wait until an admin lets you in, then work as
// that person until the event ends. No PIN, no password.
const POLL_MS = 3000
const route = useRoute()
const auth = useAuthStore()
const store = useStaffJoinStore()
const code = computed(() => String(route.params.code ?? ''))

const name = ref('')
const phase = ref<'loading' | 'form' | 'waiting'>('loading')
const waitingAs = ref('')
const error = ref<JoinError | 'rejected' | null>(null)
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function enter(role: StaffRole) {
  await auth.refresh()
  await navigateTo(homeForRole(role))
}

async function check() {
  timer = null
  try {
    const s = await store.status()
    if (!s) {
      phase.value = 'form'
      return
    }
    if (s.status === 'approved') return await enter(s.role ?? 'waiter')
    if (s.status === 'rejected') {
      error.value = 'rejected'
      phase.value = 'form'
      return
    }
    waitingAs.value = s.name
    phase.value = 'waiting'
  }
  catch {
    // Offline for a moment: keep waiting.
  }
  if (phase.value !== 'form') timer = setTimeout(check, POLL_MS)
}

async function submit() {
  error.value = null
  busy.value = true
  try {
    const res = await store.join(code.value, name.value)
    if (typeof res === 'string') {
      error.value = res
      return
    }
    waitingAs.value = res.name
    phase.value = 'waiting'
    timer = setTimeout(check, POLL_MS)
  }
  finally {
    busy.value = false
  }
}

onMounted(async () => {
  // Already signed in on this device: straight to work.
  if (auth.isAuthenticated || await auth.refresh()) return enter(auth.staff!.role)
  await check()
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <main class="mx-auto max-w-sm px-4 py-8">
    <h1 class="text-2xl font-bold text-slate-900">
      {{ $t('staff.join.title') }}
    </h1>

    <p v-if="phase === 'loading'" class="mt-4 text-sm text-slate-500">
      {{ $t('staff.join.loading') }}
    </p>

    <div v-else-if="phase === 'waiting'" class="mt-6 rounded-lg border border-slate-200 bg-surface p-4" role="status" data-test="join-waiting">
      <p class="flex items-center gap-2 font-semibold text-slate-900">
        <UIcon name="i-lucide-loader-circle" class="size-5 shrink-0 animate-spin" aria-hidden="true" />
        {{ $t('staff.join.waiting', { name: waitingAs }) }}
      </p>
      <p class="mt-2 text-sm text-slate-600">
        {{ $t('staff.join.waitingHint') }}
      </p>
    </div>

    <form v-else class="mt-4 space-y-3" data-test="join-form" @submit.prevent="submit">
      <p class="text-sm text-slate-600">
        {{ $t('staff.join.intro') }}
      </p>
      <p v-if="error" class="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert" data-test="join-error">
        {{ $t(`staff.join.error.${error}`) }}
      </p>
      <div>
        <label class="block text-sm font-medium text-slate-700" for="join-name">{{ $t('staff.join.name') }}</label>
        <input
          id="join-name"
          v-model="name"
          required
          minlength="2"
          maxlength="30"
          autocomplete="nickname"
          class="mt-1 min-h-[48px] w-full rounded border border-slate-300 px-3 text-lg"
        >
      </div>
      <button type="submit" class="min-h-[52px] w-full rounded bg-brand-gradient px-4 font-semibold text-brand-contrast disabled:opacity-60" :disabled="busy" data-test="join-submit">
        {{ $t('staff.join.submit') }}
      </button>
    </form>
  </main>
</template>
