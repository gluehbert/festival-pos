<script setup lang="ts">
import EventTablesPanel from '~/components/admin/EventTablesPanel.vue'
import EventFeaturesPanel from '~/components/admin/EventFeaturesPanel.vue'
import GuestLimitsPanel from '~/components/admin/GuestLimitsPanel.vue'
import { useAdminToast } from '~/composables/useAdminPage'
import type { EventDto } from '~/../server/lib/contracts/admin'

// How this festival runs: its tables, which features it uses and how much a
// guest phone may order unpaid. Moved out of the overview so that one shows
// only where the event stands.
defineProps<{ event: EventDto }>()
const toast = useAdminToast()
</script>

<template>
  <div class="space-y-4">
    <section class="rounded border border-slate-200 bg-surface">
      <h2 class="px-4 pt-4 text-sm font-semibold text-slate-700">
        {{ $t('admin.tables.title') }}
      </h2>
      <EventTablesPanel :event="event" @saved="toast.success" @failed="toast.failure" />
    </section>
    <section class="rounded border border-slate-200 bg-surface">
      <h2 class="px-4 pt-4 text-sm font-semibold text-slate-700">
        {{ $t('admin.features.title') }}
      </h2>
      <EventFeaturesPanel :event="event" @saved="toast.success" @failed="toast.failure" />
    </section>
    <section class="rounded border border-slate-200 bg-surface">
      <h2 class="px-4 pt-4 text-sm font-semibold text-slate-700">
        {{ $t('admin.guestLimits.title') }}
      </h2>
      <GuestLimitsPanel :event="event" @saved="toast.success" @failed="toast.failure" />
    </section>
  </div>
</template>
