<script setup lang="ts">
import { ref } from 'vue'
import { navigateTo } from '#imports'
import { useApi } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import type { PreviewAs } from '~/../server/lib/contracts/preview'

// Preview deployments only: one tap signs in as each role or as a guest.
// Vercel's own login guards these URLs; the server refuses it elsewhere.
const AS: readonly PreviewAs[] = ['waiter', 'lead', 'kitchen', 'bar', 'admin', 'guest']

const auth = useAuthStore()
const busy = ref(false)
// The server's reason, so a broken preview database is easy to spot.
const failed = ref<string | null>(null)

async function enter(as: PreviewAs) {
  busy.value = true
  failed.value = null
  try {
    const { to } = await useApi().post<{ to: string }>('/api/preview/login', { as })
    if (as !== 'guest') await auth.refresh()
    await navigateTo(to)
  }
  catch (e: unknown) {
    type Payload = { message?: string; data?: { message?: string } }
    const data = (e as { data?: Payload }).data
    failed.value = data?.data?.message ?? data?.message ?? String((e as Error).message ?? e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mt-6 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-3" data-test="preview-login">
    <h2 class="text-sm font-semibold text-amber-900">
      {{ $t('staff.previewLogin.title') }}
    </h2>
    <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <button
        v-for="a in AS"
        :key="a"
        type="button"
        class="min-h-[44px] rounded-lg border border-amber-400 bg-surface px-3 font-semibold text-slate-900 disabled:opacity-50"
        :disabled="busy"
        :data-test="`preview-login-${a}`"
        @click="enter(a)"
      >
        {{ $t(`staff.previewLogin.as.${a}`) }}
      </button>
    </div>
    <p v-if="failed !== null" class="mt-2 text-sm text-red-700" role="alert">
      {{ $t('staff.previewLogin.failed', { reason: failed }) }}
    </p>
  </section>
</template>
