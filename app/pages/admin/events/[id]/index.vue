<script setup lang="ts">
import { navigateTo } from '#imports'
import EventTrialPanel from '~/components/admin/EventTrialPanel.vue'
import EventEndPanel from '~/components/admin/EventEndPanel.vue'
import EventDeletePanel from '~/components/admin/EventDeletePanel.vue'
import SetupChecklist from '~/components/admin/event/SetupChecklist.vue'
import { useAdminToast } from '~/composables/useAdminPage'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()

const { t } = useI18n()
const admin = useAdminStore()
const toast = useAdminToast()

async function onDeleted() {
  const id = props.event.id
  toast.success(t('admin.delete.done'))
  await navigateTo('/admin/events')
  admin.dropEvent(id)
}
</script>

<template>
  <div class="space-y-4">
    <SetupChecklist :event="event" />
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
