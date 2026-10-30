import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { LANE_ROUND_MS, productionCards } from '~/../server/lib/contracts/production'
import type {
  ProductionLane,
  ProductionOrderDoneResponse,
  ProductionQueue,
  ProductionQueueItem,
  ProductionStatus,
} from '~/../server/lib/contracts/production'

type Station = 'kitchen' | 'bar'

// All open items of one table at this station: one card on the screen.
// Every send from a table is its own order, so a card can hold several.
// Counter sales and staff meals have no table and keep one card per order.
// With buzzer lanes a later round of a table is a card of its own.
export interface ProductionOrderGroup {
  key: string
  orderIds: string[]
  tableNo: number
  orderKind: ProductionQueueItem['orderKind']
  orderedAt: string
  items: ProductionQueueItem[]
}

export const useProductionStore = defineStore('production', () => {
  const station = ref<Station | null>(null)
  const queue = ref<ProductionQueueItem[]>([])
  // Buzzer lanes; empty when the event has no buzzer.
  const lanes = ref<ProductionLane[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)
  // Polling health, kept apart from `error` (which failed actions set too):
  // the screen warns when the queue it shows may be outdated.
  const syncFailed = ref(false)
  const lastSyncAt = ref<number | null>(null)

  // Local changes the server may not show yet. A poll that was already
  // running when the user tapped would otherwise bring a finished item back
  // for a moment. `item: null` hides it, an item replaces or re-adds it.
  // An override goes once a poll that started after the change settled
  // (`settledSeq`) has answered; until it settled it always applies.
  const overrides = new Map<string, { item: ProductionQueueItem | null; settledSeq: number | null }>()
  let fetchSeq = 0

  function withOverrides(items: ProductionQueueItem[]): ProductionQueueItem[] {
    const out = items.filter((i) => overrides.get(i.orderItemId)?.item !== null)
    for (const [id, o] of overrides) {
      if (!o.item) continue
      const at = out.findIndex((i) => i.orderItemId === id)
      if (at === -1) out.push(o.item)
      else out[at] = o.item
    }
    return out.sort((a, b) => a.orderedAt.localeCompare(b.orderedAt))
  }

  function override(id: string, item: ProductionQueueItem | null): void {
    overrides.set(id, { item, settledSeq: null })
    queue.value = withOverrides(queue.value)
  }

  function settle(id: string): void {
    const o = overrides.get(id)
    if (o) o.settledSeq = fetchSeq
  }

  // Throws on failure so the poller backs off.
  async function fetchQueue(stationParam?: Station): Promise<void> {
    loading.value = true
    error.value = null
    const seq = ++fetchSeq
    try {
      const api = useApi()
      const suffix = stationParam ? `?station=${stationParam}` : ''
      const res = await api.get<ProductionQueue>(`/api/production/queue${suffix}`)
      // Another station (admin switch): local changes belong to the old one.
      if (station.value !== null && res.station !== station.value) overrides.clear()
      for (const [id, o] of overrides) {
        if (o.settledSeq !== null && o.settledSeq < seq) overrides.delete(id)
      }
      station.value = res.station
      queue.value = withOverrides(res.items)
      lanes.value = res.lanes
      syncFailed.value = false
      lastSyncAt.value = Date.now()
    }
    catch (e) {
      error.value = e
      syncFailed.value = true
      throw e
    }
    finally {
      loading.value = false
    }
  }

  async function advance(
    orderItemId: string,
    nextStatus: 'in_progress' | 'done',
  ): Promise<void> {
    const original = queue.value.find((i) => i.orderItemId === orderItemId)
    if (!original) return
    // Optimistic update
    override(orderItemId, nextStatus === 'done' ? null : { ...original, productionStatus: 'in_progress' })
    try {
      const api = useApi()
      await api.patch<{ orderItemId: string; productionStatus: ProductionStatus }>(
        `/api/production/items/${orderItemId}`,
        { nextStatus },
      )
      settle(orderItemId)
    }
    catch (e) {
      // Rollback
      overrides.delete(orderItemId)
      queue.value = withOverrides([...queue.value.filter((i) => i.orderItemId !== orderItemId), original])
      error.value = e
      throw e
    }
  }

  // "Undo" after done: back to in progress, as long as the waiter has
  // not served it yet (the server refuses then). Shown again at once.
  async function undoDone(items: ProductionQueueItem[]): Promise<void> {
    for (const i of items) override(i.orderItemId, { ...i, productionStatus: 'in_progress' })
    const results = await Promise.allSettled(items.map((i) =>
      useApi().patch(`/api/production/items/${i.orderItemId}`, { nextStatus: 'in_progress' })))
    const failed = items.filter((_, n) => results[n]!.status === 'rejected')
    for (const i of items) {
      if (failed.includes(i)) override(i.orderItemId, null)
      settle(i.orderItemId)
    }
    if (failed.length > 0) {
      const reason = (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason
      error.value = reason
      throw reason
    }
  }

  // The queue is sorted oldest first, so the cards are too.
  const groups = computed<ProductionOrderGroup[]>(() =>
    productionCards(queue.value, lanes.value.length > 0 ? LANE_ROUND_MS : undefined).map(({ key, items }) => ({
      key,
      orderIds: [...new Set(items.map((i) => i.orderId))],
      tableNo: items[0]!.tableNo,
      orderKind: items[0]!.orderKind,
      orderedAt: items[0]!.orderedAt,
      items,
    })))

  // Returns the items that were finished, for "Undo".
  async function finishOrder(orderId: string, stationParam?: Station): Promise<ProductionQueueItem[]> {
    const gone = queue.value.filter((i) => i.orderId === orderId)
    for (const i of gone) override(i.orderItemId, null)
    try {
      const res = await useApi().post<ProductionOrderDoneResponse>(`/api/production/orders/${orderId}/done`, stationParam ? { station: stationParam } : {})
      for (const i of gone) settle(i.orderItemId)
      const done = new Set(res?.doneItemIds ?? [])
      return gone.filter((i) => done.has(i.orderItemId))
    }
    catch (e) {
      // Rollback, keeping anything that changed meanwhile out of the way.
      for (const i of gone) overrides.delete(i.orderItemId)
      const ids = new Set(gone.map((i) => i.orderItemId))
      queue.value = withOverrides([...queue.value.filter((i) => !ids.has(i.orderItemId)), ...gone])
      error.value = e
      throw e
    }
  }

  return { station, queue, lanes, groups, loading, error, syncFailed, lastSyncAt, fetchQueue, advance, finishOrder, undoDone }
})
