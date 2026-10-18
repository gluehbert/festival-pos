<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { navigateTo } from '#imports'
import EventTrialPanel from '~/components/admin/EventTrialPanel.vue'
import EventEndPanel from '~/components/admin/EventEndPanel.vue'
import EventDeletePanel from '~/components/admin/EventDeletePanel.vue'
import EventFeaturesPanel from '~/components/admin/EventFeaturesPanel.vue'
import { useAdminToast } from '~/composables/useAdminPage'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()

const { t } = useI18n()
const admin = useAdminStore()
const toast = useAdminToast()
const base = computed(() => `/admin/events/${props.event.id}`)
const menuCount = computed(() => (admin.menuEventId === props.event.id ? admin.menuItems.length : null))

async function onDeleted() {
  const id = props.event.id
  toast.success(t('admin.delete.done'))
  await navigateTo('/admin/events')
  admin.dropEvent(id)
}

onMounted(() => {
  void admin.fetchMenuItems(props.event.id).catch(() => {})
})
</script>

<template>
  <div class="space-y-4">
    <section class="rounded border border-slate-200 bg-surface p-4">
      <h2 class="mb-2 text-sm font-semibold text-slate-700">
        {{ $t('admin.workspace.setup.title') }}
      </h2>
      <ul class="divide-y divide-slate-100 text-sm">
        <li class="flex flex-wrap items-center justify-between gap-2 py-2">
          <span class="text-slate-700">{{ $t('admin.workspace.setup.branding') }}</span>
          <NuxtLink :to="`${base}/branding`" class="inline-flex min-h-[44px] items-center font-semibold text-slate-900 underline">
            {{ $t('admin.workspace.tabs.branding') }}
          </NuxtLink>
        </li>
        <li class="flex flex-wrap items-center justify-between gap-2 py-2">
          <span class="text-slate-700">
            {{ $t('admin.workspace.setup.menu') }}
            <span v-if="menuCount !== null" class="ml-1 text-slate-500" data-test="menu-count">
              ({{ $t('admin.workspace.setup.menuCount', { n: menuCount }, menuCount) }})
            </span>
          </span>
          <NuxtLink :to="`${base}/menu`" class="inline-flex min-h-[44px] items-center font-semibold text-slate-900 underline">
            {{ $t('admin.workspace.tabs.menu') }}
          </NuxtLink>
        </li>
        <li class="flex flex-wrap items-center justify-between gap-2 py-2">
          <span class="text-slate-700">{{ $t('admin.workspace.setup.qr') }}</span>
          <NuxtLink :to="`${base}/qr-codes`" class="inline-flex min-h-[44px] items-center font-semibold text-slate-900 underline">
            {{ $t('admin.workspace.tabs.qr') }}
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section class="rounded border border-slate-200 bg-surface">
      <h2 class="px-4 pt-4 text-sm font-semibold text-slate-700">
        {{ $t('admin.features.title') }}
      </h2>
      <EventFeaturesPanel :event="event" @saved="toast.success" @failed="toast.failure" />
    </section>

    <section class="rounded border border-slate-200 bg-surface">
      <h2 class="px-4 pt-4 text-sm font-semibold text-slate-700">
        {{ $t('admin.trial.title') }}
      </h2>
      <EventTrialPanel
        v-if="event.isActive || event.trialMode || event.trialOrders > 0"
        :event="event"
        @saved="toast.success"
        @failed="toast.failure"
      />
      <p v-else class="px-4 py-3 text-sm text-slate-600">
        {{ $t('admin.trial.needsActive') }}
      </p>
    </section>

    <section v-if="event.isActive" class="rounded border border-slate-200 bg-surface">
      <h2 class="px-4 pt-4 text-sm font-semibold text-slate-700">
        {{ $t('admin.end.section') }}
      </h2>
      <EventEndPanel :event="event" @saved="toast.success" @failed="toast.failure" />
    </section>

    <EventDeletePanel
      :event="event"
      @failed="toast.failure"
      @deleted="onDeleted"
    />
  </div>
</template>
