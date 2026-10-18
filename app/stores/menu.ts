import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import type { Menu, MenuItemDto, PopularItems } from '~/../server/lib/contracts/guest'
import { nextPromoEnd } from '~/utils/price-changes'

// Longest setTimeout delay browsers accept.
const MAX_DELAY_MS = 2 ** 31 - 1

export const useMenuStore = defineStore('guest-menu', () => {
  const items = ref<MenuItemDto[]>([])
  const eventId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const popular = ref<PopularItems | null>(null)

  const byCategory = computed(() => {
    const map = new Map<string, MenuItemDto[]>()
    for (const item of items.value) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return map
  })

  // While a promotion runs, load the menu again when it ends, so the old
  // price shows without a reload. (A promotion that starts meanwhile is
  // priced by the server and reported after ordering.)
  let promoTimer: ReturnType<typeof setTimeout> | undefined
  function schedulePromoEnd(): void {
    clearTimeout(promoTimer)
    const end = nextPromoEnd(items.value)
    if (end === null || !import.meta.client) return
    promoTimer = setTimeout(() => void refresh(), Math.min(Math.max(end - Date.now(), 0) + 1000, MAX_DELAY_MS))
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const data = await api.get<Menu>('/api/menu')
      items.value = data.items
      eventId.value = data.eventId
      schedulePromoEnd()
    }
    catch (e) {
      error.value = e
    }
    finally {
      loading.value = false
    }
  }

  // The order was refused for these articles: take them off the menu right
  // away instead of waiting for the next load.
  function markSoldOut(ids: readonly string[]): void {
    if (ids.length > 0) items.value = items.value.filter((i) => !ids.includes(i.id))
  }

  // Items for the "Frequent" tab. Staff pass the table they order for (null for
  // walk-ins); guests always get their own table. Optional: errors are ignored.
  let popularSeq = 0
  async function refreshPopular(tableNo?: number | null): Promise<void> {
    const seq = ++popularSeq
    try {
      const api = useApi()
      const query = tableNo ? `?table=${tableNo}` : ''
      const data = await api.get<PopularItems>(`/api/menu/popular${query}`)
      if (seq === popularSeq) popular.value = data
    }
    catch {
      if (seq === popularSeq) popular.value = null
    }
  }

  return { items, eventId, loading, error, byCategory, popular, refresh, refreshPopular, markSoldOut }
})
