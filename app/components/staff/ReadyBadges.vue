<script setup lang="ts">
// "Ready to serve" counts per station, shown on the ticket card and the table detail.
defineProps<{ ready: { kitchen: number; bar: number } }>()
</script>

<template>
  <p class="flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold">
    <span v-if="ready.kitchen > 0" class="inline-flex items-center gap-1">
      <UIcon name="i-lucide-utensils" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('staff.ticket.foodReady', { n: ready.kitchen }) }}
    </span>
    <span v-if="ready.bar > 0" class="inline-flex items-center gap-1">
      <UIcon name="i-lucide-beer" class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('staff.ticket.drinksReady', { n: ready.bar }) }}
    </span>
  </p>
</template>
