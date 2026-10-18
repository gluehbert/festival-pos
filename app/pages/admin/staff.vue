<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { navigateTo, useI18n } from '#imports'
import AdminNav from '~/components/admin/AdminNav.vue'
import StaffForm from '~/components/admin/StaffForm.vue'
import StaffPasskeys from '~/components/admin/StaffPasskeys.vue'
import { useAuthStore } from '~/stores/auth'
import { useStaffAdminStore } from '~/stores/staff-admin'
import type { CreateStaff, StaffDto } from '~/../server/lib/contracts/staff-admin'

const { t } = useI18n()
const auth = useAuthStore()
const store = useStaffAdminStore()
const toast = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const busyId = ref<string | null>(null)
const passkeysOpen = ref<string | null>(null)

onMounted(async () => {
  if (!auth.isAuthenticated && !(await auth.refresh())) {
    await navigateTo('/staff/login')
    return
  }
  if (auth.staff?.role !== 'admin') {
    await navigateTo('/staff')
    return
  }
  await store.fetchAll()
})

function showToast(kind: 'success' | 'error', text: string) {
  toast.value = { kind, text }
  setTimeout(() => {
    if (toast.value?.text === text) toast.value = null
  }, 3000)
}

function errorText(e: unknown): string {
  return (e as { data?: { message?: string } })?.data?.message ?? t('admin.staff.failed')
}

async function onCreate(input: CreateStaff) {
  try {
    await store.create(input)
    showToast('success', t('admin.staff.created', { name: input.username }))
  }
  catch (e) {
    showToast('error', errorText(e))
  }
}

async function run(member: StaffDto, patch: Parameters<typeof store.update>[1], message: string) {
  busyId.value = member.id
  try {
    await store.update(member.id, patch)
    showToast('success', message)
  }
  catch (e) {
    showToast('error', errorText(e))
  }
  finally {
    busyId.value = null
  }
}

function resetSecret(member: StaffDto) {
  const isAdmin = member.role === 'admin'
  const value = window.prompt(isAdmin ? t('admin.staff.newPassword') : t('admin.staff.newPin'))
  if (!value) return
  void run(member, isAdmin ? { password: value } : { pin: value }, t('admin.staff.secretChanged'))
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-6">
    <header class="mb-4">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        {{ $t('admin.kicker') }}
      </p>
      <h1 class="text-2xl font-bold text-slate-900">
        {{ $t('admin.staff.title') }}
      </h1>
    </header>

    <AdminNav />

    <section class="mb-6">
      <h2 class="mb-2 text-sm font-semibold text-slate-700">
        {{ $t('admin.staff.new') }}
      </h2>
      <StaffForm @submit="onCreate" />
    </section>

    <section>
      <h2 class="mb-2 text-sm font-semibold text-slate-700">
        {{ $t('admin.staff.list') }}
      </h2>
      <p v-if="store.loading" class="text-sm text-slate-500">
        {{ $t('admin.loading') }}
      </p>
      <ul v-else class="divide-y divide-slate-200 rounded border border-slate-200 bg-surface">
        <li v-for="m in store.members" :key="m.id" class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span class="min-w-32 font-semibold" :class="m.isActive ? 'text-slate-900' : 'text-slate-500 line-through'">{{ m.username }}</span>
          <select
            :value="m.role"
            :disabled="busyId === m.id || m.id === auth.staff?.staffId"
            :aria-label="$t('admin.staff.role')"
            class="min-h-[44px] rounded border border-slate-300 px-2"
            @change="run(m, { role: ($event.target as HTMLSelectElement).value as StaffDto['role'] }, $t('admin.staff.saved'))"
          >
            <option v-for="r in ['waiter', 'lead', 'kitchen', 'bar', 'admin']" :key="r" :value="r">{{ $t(`admin.staff.roles.${r}`) }}</option>
          </select>
          <span class="flex-1 text-xs text-slate-500">
            {{ m.hasPassword ? $t('admin.staff.password') : '' }}{{ m.hasPassword && m.hasPin ? ' · ' : '' }}{{ m.hasPin ? $t('admin.staff.pin') : '' }}
          </span>
          <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3" :disabled="busyId === m.id" @click="resetSecret(m)">
            {{ m.role === 'admin' ? $t('admin.staff.resetPassword') : $t('admin.staff.resetPin') }}
          </button>
          <button
            type="button"
            class="min-h-[44px] rounded border border-slate-300 px-3"
            :aria-expanded="passkeysOpen === m.id"
            @click="passkeysOpen = passkeysOpen === m.id ? null : m.id"
          >
            {{ $t('admin.staff.passkeys.toggle') }}
          </button>
          <button
            v-if="m.id !== auth.staff?.staffId"
            type="button"
            class="min-h-[44px] rounded px-3 font-semibold"
            :class="m.isActive ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'"
            :disabled="busyId === m.id"
            @click="run(m, { isActive: !m.isActive }, m.isActive ? $t('admin.staff.deactivated') : $t('admin.staff.activated'))"
          >
            {{ m.isActive ? $t('admin.staff.deactivate') : $t('admin.staff.activate') }}
          </button>
          <StaffPasskeys v-if="passkeysOpen === m.id" :staff-id="m.id" :username="m.username" @message="showToast" />
        </li>
      </ul>
    </section>

    <div
      v-if="toast"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
      :class="toast.kind === 'success' ? 'bg-success' : 'bg-danger'"
      role="status"
    >
      {{ toast.text }}
    </div>
  </main>
</template>
