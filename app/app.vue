<script setup lang="ts">
import { computed } from 'vue'
import { useBranding } from '~/composables/useBranding'
import { accentCss } from '~/../server/lib/color'
import { useTheme } from '~/composables/useTheme'

const { locale } = useI18n()
const { branding } = useBranding()
const { theme } = useTheme()

// Screen readers need the page language; browsers and axe need a title.
// The active event's accent colour overrides the theme's CSS variables;
// data-theme selects light / dark / follow the OS (app/assets/css/main.css).
useHead({
  htmlAttrs: { 'lang': locale, 'data-theme': theme },
  title: computed(() => (branding.value.eventName ? `${branding.value.eventName} · Festival POS` : 'Festival POS')),
  style: [{ key: 'event-accent', innerHTML: computed(() => accentCss(branding.value.accentColor)) }],
  meta: [{ key: 'theme-color', name: 'theme-color', content: computed(() => branding.value.accentColor ?? '#7c3aed') }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
