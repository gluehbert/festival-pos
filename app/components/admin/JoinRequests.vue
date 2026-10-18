<script setup lang="ts">
import { reactive } from 'vue'
import type { JoinOverview } from '~/../server/lib/contracts/join'
import type { JoinRole } from '~/stores/staff-join'

// Waiting room (let in with a role, or turn away) and who joined this event.
const props = defineProps<{ pending: JoinOverview['pending']; members: JoinOverview['members']; busy: boolean }>()
const emit = defineEmits<{
  decide: [requestId: string, decision: 'approve' | 'reject', role: JoinRole]
  approveAll: [roles: Record<string, JoinRole>]
  setActive: [staffId: string, isActive: boolean]
}>()

const ROLES = ['waiter', 'lead', 'kitchen', 'bar'] as const
// Chosen role per request; Bedienung unless the person had another role before.
const roles = reactive<Record<string, JoinRole>>({})
const roleOf = (r: JoinOverview['pending'][number]) => roles[r.id] ?? r.role ?? 'waiter'

function approveAll() {
  emit('approveAll', Object.fromEntries(props.pending.map((r) => [r.id, roleOf(r)])))
}
</script>

<template>
  <section class="rounded-lg border border-slate-200 bg-surface p-4" data-test="join-requests">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-base font-semibold text-slate-900">
        {{ $t('admin.join.waiting', { n: pending.length }) }}
      </h2>
      <button
        v-if="pending.length > 1"
        type="button"
        class="min-h-[44px] rounded bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
        :disabled="busy"
        data-test="join-approve-all"
        @click="approveAll"
      >
        {{ $t('admin.join.approveAll') }}
      </button>
    </div>
    <p v-if="pending.length === 0" class="mt-2 text-sm text-slate-500">
      {{ $t('admin.join.nobodyWaiting') }}
    </p>
    <ul v-else class="mt-3 divide-y divide-slate-100">
      <li v-for="r in pending" :key="r.id" class="flex flex-wrap items-center gap-2 py-2" data-test="join-request">
        <!-- Own line on phones, so the name is never cut to "Li…". -->
        <span class="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <span class="block truncate font-semibold text-slate-900">{{ r.name }}</span>
          <span v-if="r.rejoin" class="block text-xs text-amber-700">{{ $t('admin.join.rejoin') }}</span>
        </span>
        <select
          :value="roleOf(r)"
          class="min-h-[44px] flex-1 rounded border border-slate-300 bg-surface px-2 text-sm sm:flex-none"
          :aria-label="$t('admin.join.roleOf', { name: r.name })"
          @change="roles[r.id] = ($event.target as HTMLSelectElement).value as JoinRole"
        >
          <option v-for="role in ROLES" :key="role" :value="role">
            {{ $t(`admin.staff.roles.${role}`) }}
          </option>
        </select>
        <button type="button" class="min-h-[44px] rounded bg-primary px-3 text-sm font-semibold text-white disabled:opacity-60" :disabled="busy" data-test="join-approve" @click="emit('decide', r.id, 'approve', roleOf(r))">
          {{ $t('admin.join.approve') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-sm disabled:opacity-60" :disabled="busy" data-test="join-reject" @click="emit('decide', r.id, 'reject', roleOf(r))">
          {{ $t('admin.join.reject') }}
        </button>
      </li>
    </ul>

    <h2 class="mt-6 text-base font-semibold text-slate-900">
      {{ $t('admin.join.members', { n: members.length }) }}
    </h2>
    <p v-if="members.length === 0" class="mt-2 text-sm text-slate-500">
      {{ $t('admin.join.noMembers') }}
    </p>
    <ul v-else class="mt-2 divide-y divide-slate-100">
      <li v-for="m in members" :key="m.id" class="flex items-center gap-2 py-2" data-test="join-member">
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium" :class="m.isActive ? 'text-slate-900' : 'text-slate-400 line-through'">{{ m.username }}</span>
          <span class="block text-xs text-slate-500">{{ $t(`admin.staff.roles.${m.role}`) }}</span>
        </span>
        <button
          type="button"
          class="min-h-[44px] rounded border border-slate-300 px-3 text-sm disabled:opacity-60"
          :disabled="busy"
          data-test="join-member-toggle"
          @click="emit('setActive', m.id, !m.isActive)"
        >
          {{ $t(m.isActive ? 'admin.join.lock' : 'admin.join.unlock') }}
        </button>
      </li>
    </ul>
  </section>
</template>
