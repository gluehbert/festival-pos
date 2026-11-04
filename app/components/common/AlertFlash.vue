<script setup lang="ts">
import { onMounted } from 'vue'
import { useAttention } from '~/composables/useAttention'

// A new alert lights up the whole screen edge for a moment, in every alert
// mode: a counter that has to stay quiet still sees it. Three slow pulses
// (well under three flashes a second); with reduced motion one steady glow.
const { flashKey, flashing, init } = useAttention()
onMounted(init)
</script>

<template>
  <div
    v-if="flashing"
    :key="flashKey"
    class="alert-flash pointer-events-none fixed inset-0 z-50"
    aria-hidden="true"
    data-test="alert-flash"
  />
</template>

<style scoped>
.alert-flash {
  box-shadow: inset 0 0 0 12px var(--color-amber-400), inset 0 0 120px 40px color-mix(in oklab, var(--color-amber-300) 55%, transparent);
  animation: alert-pulse 0.6s ease-in-out 3;
  opacity: 0;
}

@keyframes alert-pulse {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .alert-flash {
    animation: none;
    opacity: 0.8;
  }
}
</style>
