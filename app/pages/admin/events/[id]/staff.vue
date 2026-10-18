<script setup lang="ts">
import { computed, ref } from 'vue'
import JoinLink from '~/components/admin/JoinLink.vue'
import JoinRequests from '~/components/admin/JoinRequests.vue'
import { useStaffJoinStore, type JoinRole } from '~/stores/staff-join'
import { usePolling } from '~/composables/usePolling'
import { useAdminToast } from '~/composables/useAdminPage'
import type { EventDto } from '~/../server/lib/contracts/admin'

// Helpers for this event: one join link for everybody, the admin lets people
// in from the waiting room (with a role) and can lock them out again.
const props = defineProps<{ event: EventDto }>()
const { t } = useI18n()
const store = useStaffJoinStore()
const toast = useAdminToast()
const busy = ref(false)

// New names show up while the admin watches, e.g. during the briefing.
const polling = usePolling(() => store.load(props.event.id), { intervalMs: 3000, maxBackoffMs: 30_000 })
const overview = computed(() => store.overview)

async function run(action: () => Promise<unknown>) {
  busy.value = true
  try {
    await action()
  }
  catch {
    toast.failure(t('admin.join.failed'))
  }
  finally {
    busy.value = false
    polling.refresh()
  }
}

const createLink = () => run(() => store.newLink(props.event.id))
const decide = (id: string, decision: 'approve' | 'reject', role: JoinRole) => run(() => store.decide(props.event.id, id, decision, role))
const approveAll = (roles: Record<string, JoinRole>) => run(async () => {
  for (const [id, role] of Object.entries(roles)) await store.decide(props.event.id, id, 'approve', role)
})
const setActive = (staffId: string, isActive: boolean) => run(() => store.setActive(props.event.id, staffId, isActive))
</script>

<template>
  <div class="grid max-w-3xl gap-4">
    <p v-if="!event.isActive" class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900" data-test="join-inactive">
      {{ $t('admin.join.inactiveHint') }}
    </p>
    <p v-if="!overview" class="text-sm text-slate-500">
      {{ $t('admin.loading') }}
    </p>
    <template v-else>
      <JoinLink :url="overview.url" :busy="busy" @create="createLink" />
      <JoinRequests
        :pending="overview.pending"
        :members="overview.members"
        :busy="busy"
        @decide="decide"
        @approve-all="approveAll"
        @set-active="setActive"
      />
    </template>
  </div>
</template>
