<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import { useApi } from '~/composables/useApi'
import { useAdminStore } from '~/stores/admin'
import { useBranding } from '~/composables/useBranding'
import { LEGAL_TEXT_MAX, type LegalTexts } from '~/../server/lib/contracts/branding'

// Impressum and Datenschutz per event, shown to guests as plain text via the
// footer links on the guest pages.
const props = defineProps<{ eventId: string }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const uid = useId()
const admin = useAdminStore()
const { refresh: refreshPublicBranding } = useBranding()

const imprint = ref('')
const privacy = ref('')
const loaded = ref(false)
const busy = ref(false)

onMounted(async () => {
  try {
    const texts = await useApi().get<LegalTexts>(`/api/admin/events/${props.eventId}/legal`)
    imprint.value = texts.imprintText ?? ''
    privacy.value = texts.privacyText ?? ''
    loaded.value = true
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
})

async function save() {
  busy.value = true
  try {
    await admin.saveBranding(props.eventId, { imprintText: imprint.value, privacyText: privacy.value })
    await refreshPublicBranding()
    emit('saved', t('admin.legal.saved'))
  }
  catch (e) {
    emit('failed', (e as { data?: { message?: string } }).data?.message ?? t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <form v-if="loaded" class="space-y-4 px-4 py-4" data-test="event-legal" @submit.prevent="save">
    <h2 class="text-sm font-semibold text-slate-700">
      {{ $t('admin.legal.title') }}
    </h2>
    <p class="text-xs text-slate-500">
      {{ $t('admin.legal.hint') }}
    </p>
    <div>
      <label class="block text-xs font-semibold uppercase tracking-wide text-slate-600" :for="`${uid}-imprint`">
        {{ $t('admin.legal.imprint') }}
      </label>
      <textarea
        :id="`${uid}-imprint`"
        v-model="imprint"
        rows="8"
        :maxlength="LEGAL_TEXT_MAX"
        class="mt-1 w-full rounded border border-slate-300 bg-surface px-2 py-1 text-sm"
        data-test="legal-imprint"
      />
    </div>
    <div>
      <label class="block text-xs font-semibold uppercase tracking-wide text-slate-600" :for="`${uid}-privacy`">
        {{ $t('admin.legal.privacy') }}
      </label>
      <textarea
        :id="`${uid}-privacy`"
        v-model="privacy"
        rows="8"
        :maxlength="LEGAL_TEXT_MAX"
        class="mt-1 w-full rounded border border-slate-300 bg-surface px-2 py-1 text-sm"
        data-test="legal-privacy"
      />
    </div>
    <button type="submit" :disabled="busy" class="min-h-[44px] rounded bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
      {{ $t('admin.legal.save') }}
    </button>
  </form>
</template>
