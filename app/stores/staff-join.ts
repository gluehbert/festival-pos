import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'
import type { JoinOverview, JoinStatus } from '~/../server/lib/contracts/join'

export type JoinRole = 'waiter' | 'lead' | 'kitchen' | 'bar'
// Why joining failed, for the message on the join page.
export type JoinError = 'closed' | 'nameWaiting' | 'full' | 'invalidName' | 'failed'

function errorStatus(e: unknown): number | undefined {
  return (e as { status?: number; statusCode?: number }).status ?? (e as { statusCode?: number }).statusCode
}

// Join by link: the helper's side (join, poll) and the admin's waiting room.
export const useStaffJoinStore = defineStore('staff-join', () => {
  const overview = ref<JoinOverview | null>(null)

  async function join(code: string, name: string): Promise<JoinStatus | JoinError> {
    try {
      return await useApi().post<JoinStatus>('/api/join', { code, name }, { retries: 0 })
    }
    catch (e) {
      const status = errorStatus(e)
      if (status === 404) return 'closed'
      if (status === 409) return 'nameWaiting'
      if (status === 429) return 'full'
      if (status === 400) return 'invalidName'
      return 'failed'
    }
  }

  // null: this device is not waiting (no or used-up token).
  async function status(): Promise<JoinStatus | null> {
    try {
      return await useApi().get<JoinStatus>('/api/join/status')
    }
    catch (e) {
      if (errorStatus(e) === 404) return null
      throw e
    }
  }

  async function load(eventId: string): Promise<JoinOverview> {
    overview.value = await useApi().get<JoinOverview>(`/api/admin/events/${eventId}/join`)
    return overview.value
  }

  async function newLink(eventId: string): Promise<void> {
    await useApi().post(`/api/admin/events/${eventId}/join-code`, {})
    await load(eventId)
  }

  async function decide(eventId: string, requestId: string, decision: 'approve' | 'reject', role: JoinRole = 'waiter'): Promise<void> {
    await useApi().post(`/api/admin/events/${eventId}/join-requests/${requestId}`, { decision, role })
  }

  async function setActive(eventId: string, staffId: string, isActive: boolean): Promise<void> {
    await useApi().patch(`/api/admin/staff/${staffId}`, { isActive })
    await load(eventId)
  }

  return { overview, join, status, load, newLink, decide, setActive }
})
