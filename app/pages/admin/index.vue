<script setup lang="ts">
import { onMounted } from 'vue'
import { navigateTo } from '#imports'

onMounted(async () => {
  await navigateTo('/admin/events')
})
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-600">
    {{ $t('admin.loading') }}
  </main>
</template>
