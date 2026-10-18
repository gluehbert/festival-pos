<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from '#imports'
import AdminToast from '~/components/admin/AdminToast.vue'
import EventContextHeader from '~/components/admin/event/EventContextHeader.vue'
import { ensureAdmin, useAdminToast } from '~/composables/useAdminPage'
import { useAdminStore } from '~/stores/admin'

// Workspace for one event: the header names the event being edited, the tabs
// below (child pages) all act on it. Children get the event as a prop.
const { t } = useI18n()
const route = useRoute()
const admin = useAdminStore()
const toast = useAdminToast()
const ready = ref(false)

const eventId = computed(() => String(route.params.id))
const event = computed(() => admin.events.find((e) => e.id === eventId.value) ?? null)
const live = computed(() => admin.events.find((e) => e.isActive) ?? null)

const tabs = computed(() => {
  const base = `/admin/events/${eventId.value}`
  return [
    { to: base, key: 'admin.workspace.tabs.overview' },
    { to: `${base}/branding`, key: 'admin.workspace.tabs.branding' },
    { to: `${base}/menu`, key: 'admin.workspace.tabs.menu' },
    { to: `${base}/pricing`, key: 'admin.workspace.tabs.pricing' },
    { to: `${base}/qr-codes`, key: 'admin.workspace.tabs.qr' },
    { to: `${base}/staff`, key: 'admin.workspace.tabs.staff' },
    { to: `${base}/reports`, key: 'admin.workspace.tabs.reports' },
  ]
})

onMounted(async () => {
  if (!(await ensureAdmin())) return
  try {
    await admin.fetchEvents()
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
  ready.value = true
})
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-6">
    <NuxtLink to="/admin/events" class="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('admin.workspace.back') }}
    </NuxtLink>

    <p v-if="!ready" class="text-sm text-slate-500">
      {{ $t('admin.loading') }}
    </p>
    <p v-else-if="!event" class="rounded border border-slate-200 bg-surface p-4 text-sm text-slate-600">
      {{ $t('admin.workspace.notFound') }}
    </p>
    <template v-else>
      <EventContextHeader :event="event" :live="live" />

      <nav class="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 text-sm" :aria-label="$t('admin.workspace.tabsLabel')">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="-mb-px inline-flex min-h-[44px] shrink-0 items-center border-b-2 border-transparent px-3 text-slate-600 hover:text-slate-900"
          exact-active-class="!border-slate-900 font-semibold !text-slate-900"
        >
          {{ $t(tab.key) }}
        </NuxtLink>
      </nav>

      <NuxtPage :event="event" />
    </template>

    <AdminToast />
  </main>
</template>
