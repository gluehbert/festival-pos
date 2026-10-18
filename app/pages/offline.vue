<script setup lang="ts">
function reload() {
  window.location.reload()
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
    <span class="rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand-ink">{{ $t('offline.badge') }}</span>
    <h1 class="text-3xl font-bold text-slate-900">{{ $t('offline.title') }}</h1>
    <p class="text-base leading-7 text-slate-600">{{ $t('offline.text') }}</p>
    <div class="flex flex-wrap justify-center gap-3">
      <!-- The service worker shows this page in place of the one that failed: reloading retries it. -->
      <button type="button" class="min-h-[44px] rounded-md bg-brand-gradient px-4 font-semibold text-brand-contrast" @click="reload">{{ $t('offline.reload') }}</button>
      <NuxtLink class="flex min-h-[44px] items-center rounded-md border-2 border-slate-300 bg-surface px-4 font-semibold text-slate-900" to="/">{{ $t('offline.back') }}</NuxtLink>
    </div>
  </main>
</template>
