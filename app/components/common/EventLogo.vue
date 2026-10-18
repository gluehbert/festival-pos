<script setup lang="ts">
import type { Branding } from '~/../server/lib/contracts/branding'

// The event logo in light and dark mode. Dark mode shows the dark-mode logo
// when one was uploaded; otherwise the normal logo, on a light plate unless
// the upload check found it readable on dark (transparent background).
// Both images are in the page and CSS picks one, so "follow the OS" needs
// no JavaScript.
defineProps<{
  branding: Pick<Branding, 'logoUrl' | 'logoDarkUrl' | 'logoFitsDark'>
  alt: string
  imgClass?: string
}>()
</script>

<template>
  <img
    v-if="branding.logoUrl"
    :src="branding.logoUrl"
    :alt="alt"
    :class="[imgClass, branding.logoDarkUrl ? 'dark:hidden' : branding.logoFitsDark ? '' : 'dark:rounded dark:bg-white dark:p-1']"
    data-test="logo-light"
  >
  <img
    v-if="branding.logoDarkUrl"
    :src="branding.logoDarkUrl"
    :alt="alt"
    :class="[imgClass, 'hidden dark:block']"
    data-test="logo-dark"
  >
</template>
