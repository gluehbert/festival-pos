<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { useFormat } from '~/composables/useFormat'
import type { PasskeyDto, PasskeyList } from '~/../server/lib/contracts/passkeys'

// Passkeys of one staff member, for the admin. Removing one (lost phone) also
// ends that person's sessions on all devices.
const props = defineProps<{ staffId: string; username: string }>()
const emit = defineEmits<{ message: [kind: 'success' | 'error', text: string] }>()
const { t } = useI18n()
const { dateTime } = useFormat()
const passkeys = ref<PasskeyDto[] | null>(null)
const busy = ref(false)

onMounted(async () => {
  try {
    passkeys.value = (await useApi().get<PasskeyList>(`/api/admin/staff/${props.staffId}/passkeys`)).passkeys
  }
  catch {
    passkeys.value = []
    emit('message', 'error', t('admin.staff.passkeys.loadFailed'))
  }
})

async function remove(p: PasskeyDto) {
  if (!window.confirm(t('admin.staff.passkeys.confirmRemove', { name: p.name, user: props.username }))) return
  busy.value = true
  try {
    await useApi().del(`/api/admin/staff/${props.staffId}/passkeys/${p.id}`)
    passkeys.value = (passkeys.value ?? []).filter((x) => x.id !== p.id)
    emit('message', 'success', t('admin.staff.passkeys.removed'))
  }
  catch {
    emit('message', 'error', t('admin.staff.passkeys.removeFailed'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="w-full rounded bg-slate-50 px-3 py-2" data-test="staff-passkeys">
    <p v-if="passkeys === null" class="text-xs text-slate-500">
      {{ $t('admin.loading') }}
    </p>
    <p v-else-if="passkeys.length === 0" class="text-xs text-slate-500">
      {{ $t('admin.staff.passkeys.empty') }}
    </p>
    <ul v-else class="divide-y divide-slate-200">
      <li v-for="p in passkeys" :key="p.id" class="flex items-center gap-3 py-1 text-xs">
        <span class="flex-1">
          <span class="font-medium text-slate-800">{{ p.name }}</span>
          <span class="ml-2 text-slate-500">{{ p.lastUsedAt ? $t('staff.passkeys.lastUsed', { at: dateTime(p.lastUsedAt) }) : $t('staff.passkeys.createdAt', { at: dateTime(p.createdAt) }) }}</span>
        </span>
        <button type="button" class="min-h-[44px] rounded px-3 font-semibold text-rose-700 hover:bg-rose-50" :disabled="busy" @click="remove(p)">
          {{ $t('admin.staff.passkeys.remove') }}
        </button>
      </li>
    </ul>
  </div>
</template>
