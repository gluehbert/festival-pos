<script setup lang="ts">
// Global admin level only; everything that belongs to one event lives in its
// workspace (/admin/events/[id]).
const links = [
  { to: '/admin/events', key: 'admin.nav.events' },
  { to: '/admin/staff', key: 'admin.nav.staff' },
] as const
</script>

<template>
  <nav class="mb-4 flex flex-wrap gap-3 text-sm" :aria-label="$t('admin.kicker')">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="text-slate-600 hover:text-slate-900"
      active-class="font-semibold !text-slate-900"
    >
      {{ $t(link.key) }}
    </NuxtLink>
  </nav>
</template>
