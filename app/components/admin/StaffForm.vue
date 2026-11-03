<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CreateStaff } from '~/../server/lib/contracts/staff-admin'

const emit = defineEmits<{ (e: 'submit', input: CreateStaff): void }>()

const username = ref('')
const role = ref<CreateStaff['role']>('waiter')
const secret = ref('')
const usesPassword = computed(() => role.value === 'admin')

function onSubmit() {
  emit('submit', {
    username: username.value.trim(),
    role: role.value,
    ...(usesPassword.value ? { password: secret.value } : { pin: secret.value }),
  })
  username.value = ''
  secret.value = ''
}
</script>

<template>
  <form class="grid gap-3 rounded border border-slate-200 bg-surface p-4 sm:grid-cols-4" @submit.prevent="onSubmit">
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.staff.username') }}</span>
      <input v-model="username" required pattern="[\w.\-]{3,64}" autocomplete="off" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ $t('admin.staff.role') }}</span>
      <select v-model="role" class="mt-1 w-full rounded border border-slate-300 px-2 py-1">
        <option v-for="r in ['waiter', 'lead', 'kitchen', 'bar', 'cafe', 'admin']" :key="r" :value="r">{{ $t(`admin.staff.roles.${r}`) }}</option>
      </select>
    </label>
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">
        {{ usesPassword ? $t('admin.staff.password') : $t('admin.staff.pin') }}
      </span>
      <input
        v-model="secret"
        required
        autocomplete="new-password"
        :type="usesPassword ? 'password' : 'text'"
        :inputmode="usesPassword ? 'text' : 'numeric'"
        :pattern="usesPassword ? '.{12,}' : '\\d{4,8}'"
        :title="usesPassword ? $t('admin.staff.passwordHint') : $t('admin.staff.pinHint')"
        class="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono"
      >
    </label>
    <div class="flex items-end">
      <button type="submit" class="min-h-[44px] w-full rounded bg-primary px-3 text-sm font-semibold text-white">
        {{ $t('admin.staff.create') }}
      </button>
    </div>
  </form>
</template>
