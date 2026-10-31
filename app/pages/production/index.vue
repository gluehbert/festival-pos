<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useProductionStore, type ProductionOrderGroup } from '~/stores/production'
import { usePolling } from '~/composables/usePolling'
import OrderCard from '~/components/production/OrderCard.vue'
import LanesView from '~/components/production/LanesView.vue'
import StationFilter from '~/components/production/StationFilter.vue'
import SoldOutPanel from '~/components/production/SoldOutPanel.vue'
import StaleBanner from '~/components/common/StaleBanner.vue'
import WaiterCalls from '~/components/staff/WaiterCalls.vue'
import { useBranding } from '~/composables/useBranding'
import { useAttention } from '~/composables/useAttention'
import { groupLabel } from '~/utils/production-card'
import { createSeenTracker } from '~/utils/arrivals'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'

type Station = 'kitchen' | 'bar'

const { t } = useI18n()
const auth = useAuthStore()
const production = useProductionStore()

const adminStation = ref<Station>('kitchen')
const busyIds = ref<Set<string>>(new Set())
const toast = ref<{ kind: 'success' | 'error'; text: string; undo?: ProductionQueueItem[] } | null>(null)
// How long "Undo" is offered after "Done".
const UNDO_MS = 6000
let toastTimer: ReturnType<typeof setTimeout> | null = null

const isAdmin = computed(() => auth.staff?.role === 'admin')
// Tables calling for the service show on the bar screen: every waiter passes it.
const { branding } = useBranding()

const finishingIds = ref<Set<string>>(new Set())

const effectiveStation = computed<Station | undefined>(() => {
  if (auth.staff?.role === 'kitchen' || auth.staff?.role === 'bar') return auth.staff.role
  if (isAdmin.value) return adminStation.value
  return undefined
})

// With buzzers the screen shows their lanes instead of the views.
const lanesActive = computed(() => production.lanes.length > 0)

// A drink is ready in seconds: the bar skips "Start".
const oneStep = computed(() => effectiveStation.value === 'bar')

async function load() {
  await production.fetchQueue(isAdmin.value ? adminStation.value : undefined)
}

// Outside the poller a failed load only shows the warning; the poller retries.
function loadQuietly() {
  return load().catch(() => {})
}

// New orders in the queue: tone + vibration.
const attention = useAttention()
const arrivals = createSeenTracker()
watch(() => production.lastSyncAt, () => {
  if (arrivals.update(production.queue.map((i) => i.orderItemId)).length > 0) attention.notify()
})

onMounted(async () => {
  if (!auth.isAuthenticated) {
    const me = await auth.refresh()
    if (!me) {
      await navigateTo('/staff/login')
      return
    }
  }
  if (!['kitchen', 'bar', 'admin'].includes(auth.staff?.role ?? '')) {
    await navigateTo('/staff')
    return
  }
  await loadQuietly()
})

const polling = usePolling(load, { intervalMs: 4000, immediate: false, maxBackoffMs: 30_000 })

watch(adminStation, async () => {
  if (!isAdmin.value) return
  polling.stop()
  arrivals.reset()
  await loadQuietly()
  polling.start()
})

function showToast(kind: 'success' | 'error', text: string, undo?: ProductionQueueItem[]) {
  const next = { kind, text, undo: undo && undo.length > 0 ? undo : undefined }
  toast.value = next
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (toast.value === next) toast.value = null
  }, next.undo ? UNDO_MS : 2500)
}

async function onUndo() {
  const items = toast.value?.undo
  if (!items) return
  toast.value = null
  try {
    await production.undoDone(items)
    showToast('success', t('production.toastUndone'))
  }
  catch {
    showToast('error', t('production.toastUndoFailed'))
  }
}

// Several ids when the card shows a merged line: one toast, one undo for all.
async function onAdvance(orderItemIds: string[], next: 'in_progress' | 'done') {
  const ids = orderItemIds.filter((id) => !busyIds.value.has(id))
  if (ids.length === 0) return
  busyIds.value = new Set([...busyIds.value, ...ids])
  const items = production.queue.filter((i) => ids.includes(i.orderItemId))
  const results = await Promise.allSettled(ids.map((id) => production.advance(id, next)))
  const ok = items.filter((i) => results[ids.indexOf(i.orderItemId)]!.status === 'fulfilled')
  if (ok.length < ids.length) showToast('error', t('production.toastFailed'))
  else if (next === 'done') showToast('success', t('production.toastDone'), ok)
  else showToast('success', t('production.toastStarted'))
  const after = new Set(busyIds.value)
  for (const id of ids) after.delete(id)
  busyIds.value = after
}

// One card can hold several orders of a table: finish each of them.
// From a buzzer the toast names the card, as nobody looked at the screen.
async function onFinish(group: ProductionOrderGroup, named = false) {
  if (finishingIds.value.has(group.key)) return
  finishingIds.value = new Set([...finishingIds.value, group.key])
  const results = await Promise.allSettled(group.orderIds.map((id) =>
    production.finishOrder(id, isAdmin.value ? adminStation.value : undefined)))
  const done = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (results.some((r) => r.status === 'rejected')) showToast('error', t('production.toastFailed'))
  else showToast('success', named ? t('production.toastDoneFor', { label: groupLabel(group, t) }) : t('production.toastDone'), done)
  const after = new Set(finishingIds.value)
  after.delete(group.key)
  finishingIds.value = after
  // The server refills a freed lane on the next poll: ask now, not in 4 s.
  if (lanesActive.value) await loadQuietly()
}
</script>

<template>
  <main class="mx-auto px-4 py-3" :class="lanesActive ? 'max-w-none pb-0' : 'max-w-5xl'">
    <!-- Title and "sold out" sit in the app bar: the screen is for orders. -->
    <ClientOnly>
      <Teleport to="#page-title">
        <h1 class="truncate text-xl font-extrabold text-slate-900">
          <StationFilter v-if="isAdmin" v-model="adminStation" />
          <template v-else>
            {{ $t(`common.station.${effectiveStation ?? 'kitchen'}`) }}
          </template>
        </h1>
      </Teleport>
      <Teleport to="#page-tools">
        <SoldOutPanel
          :key="effectiveStation"
          :station="isAdmin ? adminStation : undefined"
          @result="(ok) => showToast(ok ? 'success' : 'error', ok ? t('production.soldOut.saved') : t('production.toastFailed'))"
        />
      </Teleport>
    </ClientOnly>

    <StaleBanner :failed="production.syncFailed" :since="production.lastSyncAt" @retry="polling.refresh()" />

    <WaiterCalls v-if="branding.waiterCallsEnabled && effectiveStation === 'bar'" bar />

    <p v-if="production.loading && production.queue.length === 0" class="mt-8 text-sm text-slate-500">
      {{ $t('production.loading') }}
    </p>
    <p v-else-if="production.queue.length === 0" class="mt-8 text-sm text-slate-500">
      {{ $t('production.empty') }}
    </p>

    <LanesView
      v-else-if="lanesActive"
      :groups="production.groups"
      :lanes="production.lanes"
      :finishing="finishingIds"
      @finish="onFinish"
    />

    <ul v-else class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="group in production.groups" :key="group.key">
        <OrderCard
          :group="group"
          :busy-ids="busyIds"
          :finishing="finishingIds.has(group.key)"
          :one-step="oneStep"
          @advance="(ids, n) => onAdvance(ids, n)"
          @finish="onFinish(group)"
        />
      </li>
    </ul>

    <transition name="fade">
      <div
        v-if="toast"
        class="fixed left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
        :class="[toast.kind === 'success' ? 'bg-success' : 'bg-danger', lanesActive ? 'top-2' : 'bottom-6']"
        role="status"
      >
        <UIcon :name="toast.kind === 'success' ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ toast.text }}</span>
        <button
          v-if="toast.undo"
          type="button"
          class="ml-1 inline-flex min-h-[44px] items-center gap-1 rounded-full bg-white/20 px-4 font-bold hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          data-test="undo-done"
          @click="onUndo"
        >
          <UIcon name="i-lucide-undo-2" class="size-4 shrink-0" aria-hidden="true" />
          {{ $t('production.undo') }}
        </button>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
