<script setup lang="ts">
import { computed, ref } from 'vue'
import EventStatusBadge from '~/components/admin/event/EventStatusBadge.vue'
import { eventStatus, useAdminToast } from '~/composables/useAdminPage'
import { useBranding } from '~/composables/useBranding'
import { useFormat } from '~/composables/useFormat'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

// "You are editing …": which event the tabs below change, whether guests see
// those changes right away, and the switch to make it the live event.
const props = defineProps<{ event: EventDto; live: EventDto | null }>()

const { t } = useI18n()
const admin = useAdminStore()
const toast = useAdminToast()
const { refresh: refreshPublicBranding } = useBranding()
const { eventDates } = useFormat()
const confirming = ref(false)
const busy = ref(false)

const status = computed(() => eventStatus(props.event))
const tone = {
  live: 'border-emerald-500 bg-emerald-50',
  trial: 'border-amber-400 bg-amber-50',
  draft: 'border-slate-300 bg-surface',
  ended: 'border-slate-300 bg-slate-100',
} as const

async function activate() {
  busy.value = true
  try {
    await admin.activateEvent(props.event.id)
    await refreshPublicBranding()
    toast.success(t('admin.events.activated', { name: props.event.name }))
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
    confirming.value = false
  }
}
</script>

<template>
  <section class="mb-4 rounded-lg border-2 p-4" :class="tone[status]" data-test="event-context">
    <p class="text-xs uppercase tracking-wide text-slate-500">
      {{ $t('admin.workspace.editing') }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-2xl font-bold text-slate-900">
        {{ event.name }}
      </h1>
      <EventStatusBadge :event="event" />
    </div>
    <p class="text-sm text-slate-700">
      {{ eventDates(event.startsOn, event.endsOn) ?? $t('admin.events.undated') }}
      · {{ $t('admin.events.summary', { pin: event.pinCode, from: event.tableRangeFrom, to: event.tableRangeTo }) }}
    </p>

    <p class="mt-2 text-sm font-medium" :class="status === 'live' ? 'text-emerald-900' : status === 'trial' ? 'text-amber-900' : 'text-slate-700'">
      {{ $t(`admin.workspace.hint.${status}`) }}
      <template v-if="!event.isActive">
        {{ live ? $t('admin.workspace.currentlyLive', { name: live.name }) : $t('admin.workspace.nothingLive') }}
      </template>
    </p>

    <div v-if="event.isActive" class="mt-3 flex flex-wrap gap-2">
      <NuxtLink to="/staff" class="inline-flex min-h-[44px] items-center rounded border border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-800">
        {{ $t('admin.events.toService') }}
      </NuxtLink>
      <NuxtLink to="/production" class="inline-flex min-h-[44px] items-center rounded border border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-800">
        {{ $t('admin.events.toProduction') }}
      </NuxtLink>
    </div>

    <div v-else-if="confirming" class="mt-3 rounded border border-slate-300 bg-surface p-3" role="alert">
      <p class="text-sm text-slate-900">
        {{ $t('admin.workspace.confirmActivate', { name: event.name }) }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-[44px] rounded bg-success px-3 text-sm font-semibold text-white disabled:opacity-50"
          :disabled="busy"
          @click="activate"
        >
          {{ $t('admin.workspace.confirmActivateButton') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 text-sm text-slate-800" @click="confirming = false">
          {{ $t('admin.trial.cancel') }}
        </button>
      </div>
    </div>

    <div v-else-if="live" class="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span class="font-semibold text-slate-900">{{ $t('admin.workspace.endLiveFirst') }}</span>
      <NuxtLink
        :to="`/admin/events/${live.id}`"
        class="inline-flex min-h-[44px] items-center rounded border border-slate-300 bg-surface px-3 font-semibold text-slate-800"
      >
        {{ $t('admin.workspace.toLive', { name: live.name }) }}
      </NuxtLink>
    </div>

    <div v-else class="mt-3">
      <button
        type="button"
        class="min-h-[44px] rounded bg-primary px-3 text-sm font-semibold text-white"
        @click="confirming = true"
      >
        {{ $t(status === 'ended' ? 'admin.workspace.reactivate' : 'admin.events.activate') }}
      </button>
    </div>
  </section>
</template>
