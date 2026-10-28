<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useProductionStore, type ProductionOrderGroup } from '~/stores/production'
import { usePolling } from '~/composables/usePolling'
import QueueItem from '~/components/production/QueueItem.vue'
import OrderCard from '~/components/production/OrderCard.vue'
import StationFilter from '~/components/production/StationFilter.vue'
import SoldOutPanel from '~/components/production/SoldOutPanel.vue'
import StaleBanner from '~/components/common/StaleBanner.vue'
import { useAttention } from '~/composables/useAttention'
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

// "orders" = one card per table (default), "items" = one tile per item.
// Remembered per device; storage may be unavailable (private mode).
type View = 'orders' | 'items'
const VIEW_KEY = 'production-view'
const view = ref<View>('orders')
function setView(v: View) {
  view.value = v
  try {
    localStorage.setItem(VIEW_KEY, v)
  }
  catch { /* not remembered, still works */ }
}
const finishingIds = ref<Set<string>>(new Set())

const effectiveStation = computed<Station | undefined>(() => {
  if (auth.staff?.role === 'kitchen' || auth.staff?.role === 'bar') return auth.staff.role
  if (isAdmin.value) return adminStation.value
  return undefined
})

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
  try {
    if (localStorage.getItem(VIEW_KEY) === 'items') view.value = 'items'
  }
  catch { /* default view */ }
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
async function onFinish(group: ProductionOrderGroup) {
  if (finishingIds.value.has(group.key)) return
  finishingIds.value = new Set([...finishingIds.value, group.key])
  const results = await Promise.allSettled(group.orderIds.map((id) =>
    production.finishOrder(id, isAdmin.value ? adminStation.value : undefined)))
  const done = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (results.some((r) => r.status === 'rejected')) showToast('error', t('production.toastFailed'))
  else showToast('success', t('production.toastDone'), done)
  const after = new Set(finishingIds.value)
  after.delete(group.key)
  finishingIds.value = after
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-slate-900">
        <StationFilter v-if="isAdmin" v-model="adminStation" />
        <template v-else>
          {{ $t(`common.station.${effectiveStation ?? 'kitchen'}`) }}
        </template>
      </h1>
      <div class="inline-flex gap-1 rounded-full bg-slate-100 p-1" role="group" :aria-label="$t('production.viewLabel')">
        <button
          v-for="v in (['orders', 'items'] as const)"
          :key="v"
          type="button"
          class="min-h-[44px] rounded-full px-4 text-sm font-semibold"
          :class="view === v ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-200'"
          :aria-pressed="view === v"
          @click="setView(v)"
        >
          {{ $t(`production.view.${v}`) }}
        </button>
      </div>
    </header>

    <StaleBanner :failed="production.syncFailed" :since="production.lastSyncAt" @retry="polling.refresh()" />

    <SoldOutPanel
      :key="effectiveStation"
      :station="isAdmin ? adminStation : undefined"
      @result="(ok) => showToast(ok ? 'success' : 'error', ok ? t('production.soldOut.saved') : t('production.toastFailed'))"
    />

    <p v-if="production.loading && production.queue.length === 0" class="mt-8 text-sm text-slate-500">
      {{ $t('production.loading') }}
    </p>
    <p v-else-if="production.queue.length === 0" class="mt-8 text-sm text-slate-500">
      {{ $t('production.empty') }}
    </p>

    <ul v-else-if="view === 'orders'" class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

    <ul v-else class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="item in production.queue" :key="item.orderItemId">
        <QueueItem
          :item="item"
          :busy="busyIds.has(item.orderItemId)"
          :one-step="oneStep"
          @advance="(n) => onAdvance([item.orderItemId], n)"
        />
      </li>
    </ul>

    <transition name="fade">
      <div
        v-if="toast"
        class="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
        :class="toast.kind === 'success' ? 'bg-success' : 'bg-danger'"
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
