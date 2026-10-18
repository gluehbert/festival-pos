import { ref } from 'vue'
import { useApi } from './useApi'

export interface GuestSessionInfo {
  sessionId: string
  eventId: string
  tableNo: number
}

const cache = ref<GuestSessionInfo | null>(null)

export function useGuestSession() {
  async function load(): Promise<GuestSessionInfo | null> {
    try {
      const api = useApi()
      const data = await api.get<GuestSessionInfo>('/api/session/me')
      cache.value = data
      return data
    }
    catch {
      cache.value = null
      return null
    }
  }

  return {
    session: cache,
    load,
    tableNo: () => cache.value?.tableNo ?? null,
    sessionId: () => cache.value?.sessionId ?? null,
    eventId: () => cache.value?.eventId ?? null,
  }
}
