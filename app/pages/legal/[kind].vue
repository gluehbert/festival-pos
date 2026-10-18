<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useFetch, useHead } from '#imports'
import type { LegalTexts } from '~/../server/lib/contracts/branding'

// Impressum (/legal/imprint) and Datenschutz (/legal/privacy) of the active
// event. Plain text, kept as written (line breaks); never rendered as HTML.
const route = useRoute()
const { t } = useI18n()
const kind = computed(() => (route.params.kind === 'privacy' ? 'privacy' : 'imprint'))
const { data, pending } = useFetch<LegalTexts>('/api/event/legal', { key: 'event-legal' })
const text = computed(() => (kind.value === 'privacy' ? data.value?.privacyText : data.value?.imprintText) ?? null)
const title = computed(() => t(`legal.${kind.value}`))
useHead({ title })
</script>

<template>
  <main class="mx-auto max-w-3xl px-4 py-6">
    <h1 class="text-2xl font-bold text-slate-900">
      {{ title }}
    </h1>
    <p v-if="data?.eventName" class="text-sm text-slate-500">
      {{ data.eventName }}
    </p>
    <p v-if="pending && !data" class="mt-6 text-sm text-slate-500">
      {{ $t('legal.loading') }}
    </p>
    <article v-else-if="text" class="mt-4 whitespace-pre-line break-words text-base leading-relaxed text-slate-800" data-test="legal-text">
      {{ text }}
    </article>
    <p v-else class="mt-6 text-sm text-slate-500" data-test="legal-missing">
      {{ $t('legal.missing') }}
    </p>
  </main>
</template>
