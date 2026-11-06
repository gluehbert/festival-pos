<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import { useProductionStore, type ProductionOrderGroup } from '~/stores/production'
import { usePolling } from '~/composables/usePolling'
import LanesView from '~/components/production/LanesView.vue'
import StationFilter from '~/components/production/StationFilter.vue'
import SoldOutPanel from '~/components/production/SoldOutPanel.vue'
import CafeCounterSwitch from '~/components/production/CafeCounterSwitch.vue'
import StationGuide from '~/components/production/StationGuide.vue'
import StaleBanner from '~/components/common/StaleBanner.vue'
import WaiterCalls from '~/components/staff/WaiterCalls.vue'
import { useBranding } from '~/composables/useBranding'
import { useAttention } from '~/composables/useAttention'
import { groupLabel } from '~/utils/production-card'
import { createLaneFillTracker } from '~/utils/arrivals'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'

type Station = 'kitchen' | 'bar' | 'cafe'

const { t } = useI18n()
const auth = useAuthStore()
const production = useProductionStore()

const adminStation = ref<Station>('kitchen')
// shallowRef: the timer below compares the very object it was set to; a deep
// ref would hand back a proxy and the toast would never go.
const toast = shallowRef<{ kind: 'success' | 'error'; text: string; undo?: ProductionQueueItem[] } | null>(null)
// How long "Undo" is offered after "Done".
const UNDO_MS = 15_000
let toastTimer: ReturnType<typeof setTimeout> | null = null

const isAdmin = computed(() => auth.staff?.role === 'admin')
// Tables calling for the service show on the bar screen: every waiter passes it.
const { branding } = useBranding()

const finishingIds = ref<Set<string>>(new Set())

const effectiveStation = computed<Station | undefined>(() => {
  if (auth.staff?.role === 'kitchen' || auth.staff?.role === 'bar' || auth.staff?.role === 'cafe') return auth.staff.role
  if (isAdmin.value) return adminStation.value
  return undefined
})


async function load() {
  await production.fetchQueue(isAdmin.value ? adminStation.value : undefined)
}

// Outside the poller a failed load only shows the warning; the poller retries.
function loadQuietly() {
  return load().catch(() => {})
}

// A lane that was empty got a card: tone + vibration, and that lane lights
// up (not the whole screen). New cards under "Next up" need nobody at once:
// they only stand out for a moment. Lanes another screen shows stay quiet.
const attention = useAttention()
const laneFills = createLaneFillTracker()
const FLASH_MS = 1800
const flash = ref<number[]>([])
let flashTimer: ReturnType<typeof setTimeout> | null = null
watch(() => production.lastSyncAt, () => {
  const filled = laneFills.update(production.lanes).filter((lane) => !production.hiddenLanes.includes(lane))
  if (filled.length === 0) return
  attention.notify({ flash: false })
  flash.value = filled
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flash.value = [] }, FLASH_MS)
})

onMounted(async () => {
  if (!auth.isAuthenticated) {
    const me = await auth.refresh()
    if (!me) {
      await navigateTo('/staff/login')
      return
    }
  }
  if (!['kitchen', 'bar', 'cafe', 'admin'].includes(auth.staff?.role ?? '')) {
    await navigateTo('/staff')
    return
  }
  await loadQuietly()
})

const polling = usePolling(load, { intervalMs: 4000, immediate: false, maxBackoffMs: 30_000 })

watch(adminStation, async () => {
  if (!isAdmin.value) return
  polling.stop()
  laneFills.reset()
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
  await loadQuietly()
}

// A paused lane finishes its card, then shrinks to a bar; a tap brings it back.
async function onPause(lane: number, paused: boolean) {
  try {
    await production.setLanes({ lane, paused }, isAdmin.value ? adminStation.value : undefined)
  }
  catch {
    showToast('error', t('production.toastFailed'))
  }
}
</script>

<template>
  <main class="mx-auto max-w-none px-4 py-3 pb-0">
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
        <CafeCounterSwitch
          v-if="effectiveStation === 'cafe'"
          @result="(ok, closed) => showToast(ok ? 'success' : 'error', ok ? t(closed ? 'production.cafe.toastClosed' : 'production.cafe.toastOpened') : t('production.toastFailed'))"
        />
        <SoldOutPanel
          :key="effectiveStation"
          :station="isAdmin ? adminStation : undefined"
          @result="(ok) => showToast(ok ? 'success' : 'error', ok ? t('production.soldOut.saved') : t('production.toastFailed'))"
        />
      </Teleport>
    </ClientOnly>

    <StaleBanner :failed="production.syncFailed" :since="production.lastSyncAt" :error="production.syncError" @retry="polling.refresh()" />

    <WaiterCalls v-if="branding.waiterCallsEnabled && effectiveStation === 'bar'" bar />

    <p
      v-if="production.cafeClosed && (effectiveStation === 'cafe' || effectiveStation === 'kitchen')"
      class="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
      data-test="cafe-closed-banner"
    >
      {{ effectiveStation === 'cafe' ? $t('production.cafe.closedBanner') : $t('production.cafe.kitchenBanner') }}
    </p>

    <p v-if="production.firstLoad && production.queue.length === 0" class="mt-8 text-sm text-slate-500">
      {{ $t('production.loading') }}
    </p>
    <StationGuide v-else-if="production.queue.length === 0" :station="effectiveStation ?? 'kitchen'" />

    <LanesView
      v-else
      :groups="production.groups"
      :lanes="production.lanes"
      :finishing="finishingIds"
      :hidden="production.hiddenLanes"
      :flash="flash"
      @finish="onFinish"
      @pause="onPause"
      @show="(lane) => production.setLaneShown(lane, true)"
    />

    <transition name="fade">
      <div
        v-if="toast"
        class="fixed left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
        :class="[toast.kind === 'success' ? 'bg-success' : 'bg-danger', 'top-2']"
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
