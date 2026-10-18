<script setup lang="ts">
// A guest's / waiter's wish, shown so kitchen and bar cannot miss it.
defineProps<{ note: string | null | undefined; large?: boolean }>()
</script>

<template>
  <p
    v-if="note"
    data-test="note-badge"
    class="mt-1 inline-flex max-w-full items-start gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 font-semibold text-amber-900"
    :class="large ? 'text-lg' : 'text-xs'"
  >
    <UIcon name="i-lucide-pencil" class="mt-[0.2em] size-[1em] shrink-0" aria-hidden="true" />
    <span class="sr-only">{{ $t('common.note.label') }}: </span>
    <span class="break-words">{{ note }}</span>
  </p>
</template>
