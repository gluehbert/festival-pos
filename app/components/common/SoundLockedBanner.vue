<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAttention } from '~/composables/useAttention'

// Browsers keep the tone off until someone taps the page. A small yellow
// bell is easy to miss, so the working screens say it across the top until
// the first tap (any tap counts, this button too).
const { mode, unlocked, init } = useAttention()
onMounted(init)
const show = computed(() => mode.value === 'loud' && !unlocked.value)
</script>

<template>
  <ClientOnly>
    <button
      v-if="show"
      type="button"
      class="flex min-h-[48px] w-full items-center justify-center gap-2 bg-amber-300 px-4 py-2 text-center text-sm font-bold text-black"
      data-test="sound-locked"
    >
      <UIcon name="i-lucide-volume-x" class="size-5 shrink-0" aria-hidden="true" />
      {{ $t('alerts.lockedBanner') }}
    </button>
  </ClientOnly>
</template>
