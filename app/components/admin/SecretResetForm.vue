<script setup lang="ts">
import { computed, ref } from 'vue'

// Inline form in a staff row: set a new PIN (4-8 digits) or, for admins, a
// new password (at least 12 characters). Same rules as StaffForm.
const props = defineProps<{ isAdmin: boolean, busy?: boolean }>()
const emit = defineEmits<{ submit: [value: string], cancel: [] }>()

const value = ref('')
const reveal = ref(false)
const valid = computed(() => (props.isAdmin ? value.value.length >= 12 : /^\d{4,8}$/.test(value.value)))

function onSubmit() {
  if (valid.value) emit('submit', value.value)
}
</script>

<template>
  <form class="flex w-full flex-wrap items-end gap-2 rounded bg-slate-50 px-3 py-2" data-test="secret-reset" @submit.prevent="onSubmit" @keydown.esc="emit('cancel')">
    <label class="text-sm">
      <span class="block text-xs uppercase tracking-wide text-slate-500">{{ isAdmin ? $t('admin.staff.newPassword') : $t('admin.staff.newPin') }}</span>
      <span class="mt-1 flex">
        <input
          v-model="value"
          required
          autofocus
          autocomplete="new-password"
          :type="isAdmin && !reveal ? 'password' : 'text'"
          :inputmode="isAdmin ? 'text' : 'numeric'"
          :title="isAdmin ? $t('admin.staff.passwordHint') : $t('admin.staff.pinHint')"
          class="min-h-[44px] rounded-l border border-slate-300 px-2 font-mono"
          data-test="secret-input"
        >
        <button
          type="button"
          class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-r border border-l-0 border-slate-300"
          :aria-label="reveal ? $t('staff.login.hideSecret') : $t('staff.login.showSecret')"
          :aria-pressed="reveal"
          @click="reveal = !reveal"
        >
          <UIcon :name="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-5 shrink-0" aria-hidden="true" />
        </button>
      </span>
    </label>
    <p class="flex-1 text-xs text-slate-500">
      {{ isAdmin ? $t('admin.staff.passwordHint') : $t('admin.staff.pinHint') }}
    </p>
    <button type="button" class="min-h-[44px] rounded px-3 text-sm text-slate-700 hover:bg-slate-100" @click="emit('cancel')">
      {{ $t('common.dialog.cancel') }}
    </button>
    <button type="submit" class="min-h-[44px] rounded bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="!valid || busy" data-test="secret-save">
      {{ $t('common.save') }}
    </button>
  </form>
</template>
