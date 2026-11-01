import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { apiError } from '~/utils/api-error'
import type {
  TicketDetail,
  TicketSummary,
  TicketsList,
} from '~/../server/lib/contracts/staff'
import type { AssignTableResponse, Assignee, TableAssignment } from '~/../server/lib/contracts/tables'

export type AssignResult = { ok: true } | { ok: false; heldBy: Assignee | null }

export const useTicketsStore = defineStore('tickets', () => {
  const tickets = ref<TicketSummary[]>([])
  // Who holds which table, and the event's table range (for the grid).
  const assignments = ref<TableAssignment[]>([])
  const tableRange = ref<{ from: number; to: number } | null>(null)
  const selected = ref<TicketDetail | null>(null)
  // The last detail load found nothing (a table without orders yet).
  const missing = ref(false)
  const loading = ref(false)
  const error = ref<unknown>(null)
  // Polling health (list and detail): the screens warn when what they show
  // may be outdated.
  const syncFailed = ref(false)
  const lastSyncAt = ref<number | null>(null)
  // Server clock minus device clock, from the last response ("vor X Min.").
  const clockOffsetMs = ref(0)

  function synced(serverNow: string): void {
    syncFailed.value = false
    lastSyncAt.value = Date.now()
    const server = Date.parse(serverNow)
    if (Number.isFinite(server)) clockOffsetMs.value = server - lastSyncAt.value
  }

  // Throws on failure so the poller backs off.
  async function refresh(params: { status?: 'open' | 'paid' | 'all'; station?: 'kitchen' | 'bar' | 'cafe' } = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const qs: string[] = []
      if (params.status) qs.push(`status=${params.status}`)
      if (params.station) qs.push(`station=${params.station}`)
      const suffix = qs.length > 0 ? `?${qs.join('&')}` : ''
      const api = useApi()
      const res = await api.get<TicketsList>(`/api/tickets${suffix}`)
      tickets.value = res.tickets
      assignments.value = res.assignments ?? []
      tableRange.value = res.tableRange ?? null
      synced(res.serverNow)
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

  // Returns null on failure. A failed reload keeps showing the ticket (with
  // the warning) instead of blanking the screen.
  async function load(ticketKey: string): Promise<TicketDetail | null> {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const res = await api.get<TicketDetail>(`/api/tickets/${encodeURIComponent(ticketKey)}`)
      selected.value = res
      missing.value = false
      synced(res.serverNow)
      return res
    }
    catch (e) {
      error.value = e
      const status = (e as { status?: number; statusCode?: number }).status ?? (e as { statusCode?: number }).statusCode
      if (status === 404) {
        // Not a sync problem: nothing ordered at this table yet.
        missing.value = true
        selected.value = null
        syncFailed.value = false
        return null
      }
      syncFailed.value = true
      if (selected.value?.ticketKey !== ticketKey) selected.value = null
      return null
    }
    finally {
      loading.value = false
    }
  }

  // The waiter brought the finished items (optionally only food or drinks).
  async function markServed(ticketKey: string, station?: 'kitchen' | 'bar' | 'cafe'): Promise<boolean> {
    try {
      await useApi().post(`/api/tickets/${encodeURIComponent(ticketKey)}/served`, station ? { station } : {})
      return true
    }
    catch (e) {
      error.value = e
      return false
    }
  }

  // Asked at the table, nobody wanted anything.
  async function markChecked(ticketKey: string): Promise<boolean> {
    try {
      await useApi().post(`/api/tickets/${encodeURIComponent(ticketKey)}/checked`, {})
      return true
    }
    catch (e) {
      error.value = e
      return false
    }
  }

  // Applies the server's answer locally, so the screen does not wait for the next poll.
  function applyAssignment(res: AssignTableResponse): void {
    const rest = assignments.value.filter((a) => a.tableNo !== res.tableNo)
    assignments.value = res.assignee
      ? [...rest, { tableNo: res.tableNo, ...res.assignee, assignedAt: new Date().toISOString() }]
      : rest
    if (selected.value && selected.value.ticketKey === `t-${res.tableNo}`) {
      selected.value = { ...selected.value, assignee: res.assignee }
    }
  }

  // "My table" / "Take over table" (takeOver after the waiter confirmed).
  // A table held by someone else comes back as heldBy. A shift lead passes
  // staffId to hand the table to that person.
  async function assign(tableNo: number, takeOver = false, staffId?: string): Promise<AssignResult> {
    try {
      const body = staffId ? { takeOver, staffId } : { takeOver }
      applyAssignment(await useApi().post<AssignTableResponse>(`/api/tickets/t-${tableNo}/assign`, body))
      return { ok: true }
    }
    catch (e) {
      error.value = e
      const { code, details } = apiError<{ assignee?: Assignee }>(e)
      return { ok: false, heldBy: code === 'TABLE_TAKEN' ? details?.assignee ?? null : null }
    }
  }

  async function release(tableNo: number): Promise<boolean> {
    try {
      applyAssignment(await useApi().del<AssignTableResponse>(`/api/tickets/t-${tableNo}/assign`))
      return true
    }
    catch (e) {
      error.value = e
      return false
    }
  }

  function clearSelection(): void {
    selected.value = null
  }

  return { tickets, assignments, tableRange, assign, release, missing, selected, loading, error, syncFailed, lastSyncAt, clockOffsetMs, refresh, load, markServed, markChecked, clearSelection }
})
