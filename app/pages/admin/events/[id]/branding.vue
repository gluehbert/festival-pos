<script setup lang="ts">
import EventBrandingForm from '~/components/admin/EventBrandingForm.vue'
import EventLegalForm from '~/components/admin/EventLegalForm.vue'
import { useAdminToast } from '~/composables/useAdminPage'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

defineProps<{ event: EventDto }>()

const admin = useAdminStore()
const toast = useAdminToast()

function onSaved(text: string) {
  toast.success(text)
  // Name and dates show in the workspace header.
  void admin.fetchEvents().catch(() => {})
}
</script>

<template>
  <div class="rounded border border-slate-200 bg-surface">
    <EventBrandingForm
      :key="event.id"
      :event-id="event.id"
      :event-name="event.name"
      @saved="onSaved"
      @failed="toast.failure"
    />
    <EventLegalForm :key="`legal-${event.id}`" class="border-t border-slate-200" :event-id="event.id" @saved="toast.success" @failed="toast.failure" />
  </div>
</template>
