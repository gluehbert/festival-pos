<script setup lang="ts">
// Shown from the first automatic retry on: which retry runs, and a way to
// stop. The first try is covered by the button's own "sending" label.
defineProps<{ sending: { attempt: number, max: number } | null }>()
defineEmits<{ cancel: [] }>()
</script>

<template>
  <div v-if="sending && sending.attempt > 0" class="flex items-center justify-center gap-3 text-sm text-slate-700" role="status" data-test="sending-state">
    <span>{{ $t('common.sending.attempt', { n: sending.attempt, max: sending.max }) }}</span>
    <button
      type="button"
      class="min-h-[44px] rounded px-3 font-semibold text-slate-700 underline hover:bg-slate-100"
      data-test="sending-cancel"
      @click="$emit('cancel')"
    >
      {{ $t('common.sending.cancel') }}
    </button>
  </div>
</template>
