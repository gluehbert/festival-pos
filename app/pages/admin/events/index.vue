<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { navigateTo } from '#imports'
import AdminNav from '~/components/admin/AdminNav.vue'
import AdminToast from '~/components/admin/AdminToast.vue'
import EventForm from '~/components/admin/EventForm.vue'
import EventStatusBadge from '~/components/admin/event/EventStatusBadge.vue'
import { ensureAdmin, useAdminToast } from '~/composables/useAdminPage'
import { useFormat } from '~/composables/useFormat'
import { useAdminStore } from '~/stores/admin'
import type { CreateEvent } from '~/../server/lib/contracts/admin'

const { t } = useI18n()
const admin = useAdminStore()
const toast = useAdminToast()
const { eventDates, dateTime } = useFormat()
const creating = ref(false)

const live = computed(() => admin.events.find((e) => e.isActive) ?? null)
const others = computed(() => admin.events.filter((e) => !e.isActive))

onMounted(async () => {
  if (!(await ensureAdmin())) return
  await admin.fetchEvents().catch(() => toast.failure(t('admin.toast.actionFailed')))
})

async function onCreate(input: CreateEvent) {
  try {
    const ev = await admin.createEvent(input)
    toast.success(t('admin.events.created'))
    await navigateTo(`/admin/events/${ev.id}`)
  }
  catch {
    toast.failure(t('admin.toast.createFailed'))
  }
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-6">
    <header class="mb-4">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        {{ $t('admin.kicker') }}
      </p>
      <h1 class="text-2xl font-bold text-slate-900">
        {{ $t('admin.events.title') }}
      </h1>
    </header>

    <AdminNav />

    <p v-if="admin.loading && admin.events.length === 0" class="text-sm text-slate-500">
      {{ $t('admin.loading') }}
    </p>

    <section
      v-if="live"
      class="mb-6 rounded-lg border-2 p-4"
      :class="live.trialMode ? 'border-amber-400 bg-amber-50' : 'border-emerald-500 bg-emerald-50'"
      data-test="live-event"
    >
      <p class="text-xs font-semibold uppercase tracking-wide" :class="live.trialMode ? 'text-amber-900' : 'text-emerald-800'">
        {{ $t(live.trialMode ? 'admin.events.liveTrialKicker' : 'admin.events.liveKicker') }}
      </p>
      <p class="mt-1 text-xl font-bold text-slate-900">
        {{ live.name }}
      </p>
      <p class="text-sm text-slate-700">
        {{ eventDates(live.startsOn, live.endsOn) ?? $t('admin.events.undated') }}
        · {{ $t('admin.events.summary', { pin: live.pinCode, from: live.tableRangeFrom, to: live.tableRangeTo }) }}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <NuxtLink
          :to="`/admin/events/${live.id}`"
          class="inline-flex min-h-[44px] items-center rounded bg-primary px-4 text-sm font-semibold text-white"
        >
          {{ $t('admin.events.edit') }}
        </NuxtLink>
        <NuxtLink to="/staff" class="inline-flex min-h-[44px] items-center rounded border border-slate-300 bg-surface px-4 text-sm font-semibold text-slate-800">
          {{ $t('admin.events.toService') }}
        </NuxtLink>
        <NuxtLink to="/production" class="inline-flex min-h-[44px] items-center rounded border border-slate-300 bg-surface px-4 text-sm font-semibold text-slate-800">
          {{ $t('admin.events.toProduction') }}
        </NuxtLink>
      </div>
    </section>
    <p
      v-else-if="!admin.loading && admin.events.length > 0"
      class="mb-6 rounded-lg border border-dashed border-slate-300 bg-surface p-4 text-sm text-slate-600"
    >
      {{ $t('admin.events.noneLive') }}
    </p>

    <section>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-slate-700">
          {{ $t(live ? 'admin.events.others' : 'admin.events.list') }}
        </h2>
        <button
          type="button"
          class="min-h-[44px] rounded border border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          :aria-expanded="creating"
          @click="creating = !creating"
        >
          {{ creating ? $t('admin.events.cancelNew') : $t('admin.events.new') }}
        </button>
      </div>

      <div v-if="creating" class="mb-4">
        <EventForm @submit="onCreate" />
      </div>

      <ul class="divide-y divide-slate-200 rounded border border-slate-200 bg-surface">
        <li v-for="ev in others" :key="ev.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p class="flex flex-wrap items-center gap-2 font-medium text-slate-900">
              {{ ev.name }}
              <EventStatusBadge :event="ev" />
            </p>
            <p class="text-sm text-slate-700">
              {{ eventDates(ev.startsOn, ev.endsOn) ?? $t('admin.events.undated') }}
            </p>
            <p v-if="ev.deactivatedAt" class="text-xs text-slate-600" data-test="ended-on">
              {{ $t('admin.events.endedOn', { date: dateTime(ev.deactivatedAt) }) }}
            </p>
          </div>
          <NuxtLink
            :to="`/admin/events/${ev.id}`"
            class="inline-flex min-h-[44px] items-center rounded border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            {{ $t('admin.events.edit') }}
          </NuxtLink>
        </li>
        <li v-if="!admin.loading && others.length === 0" class="px-4 py-6 text-center text-sm text-slate-500">
          {{ $t(live ? 'admin.events.noOthers' : 'admin.events.empty') }}
        </li>
      </ul>
    </section>

    <AdminToast />
  </main>
</template>
