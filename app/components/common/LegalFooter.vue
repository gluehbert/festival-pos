<script setup lang="ts">
import { useBranding } from '~/composables/useBranding'

// Impressum / Datenschutz links on the guest pages, once the event has them.
const { branding } = useBranding()
</script>

<template>
  <footer
    v-if="branding.hasImprint || branding.hasPrivacy"
    class="mt-8 flex justify-center gap-4 border-t border-slate-200 px-4 py-3 text-sm"
    data-test="legal-footer"
  >
    <NuxtLink v-if="branding.hasImprint" to="/legal/imprint" class="inline-flex min-h-[44px] items-center text-slate-600 underline hover:text-slate-900">
      {{ $t('legal.imprint') }}
    </NuxtLink>
    <NuxtLink v-if="branding.hasPrivacy" to="/legal/privacy" class="inline-flex min-h-[44px] items-center text-slate-600 underline hover:text-slate-900">
      {{ $t('legal.privacy') }}
    </NuxtLink>
  </footer>
</template>
