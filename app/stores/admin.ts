import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import type {
  AdminMenuItem,
  AdminMenuList,
  CreateEvent,
  CreateMenuItem,
  EndCheck,
  EventDto,
  EventsList,
  MenuImportResult,
  TableRange,
  TrialReset,
  UpdateMenuItem,
} from '~/../server/lib/contracts/admin'
import type { AssetKind, Branding, UpdateBranding } from '~/../server/lib/contracts/branding'

export const useAdminStore = defineStore('admin', () => {
  const events = ref<EventDto[]>([])
  const menuItems = ref<AdminMenuItem[]>([])
  const menuEventId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)

  async function fetchEvents(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const res = await api.get<EventsList>('/api/admin/events')
      events.value = res.events
    }
    catch (e) {
      error.value = e
      throw e
    }
    finally {
      loading.value = false
    }
  }

  async function createEvent(input: CreateEvent): Promise<EventDto> {
    const api = useApi()
    const res = await api.post<EventDto>('/api/admin/events', input)
    events.value = [res, ...events.value]
    return res
  }

  async function activateEvent(id: string): Promise<EventDto> {
    const api = useApi()
    const res = await api.post<EventDto>(`/api/admin/events/${id}/activate`)
    events.value = events.value.map((e) =>
      e.id === res.id
        ? res
        : { ...e, isActive: false },
    )
    return res
  }

  async function fetchEndCheck(id: string): Promise<EndCheck> {
    return await useApi().get<EndCheck>(`/api/admin/events/${id}/end-check`)
  }

  async function endEvent(id: string): Promise<EventDto> {
    const res = await useApi().post<EventDto>(`/api/admin/events/${id}/end`)
    replaceEvent(res)
    return res
  }

  // Only the request: the caller leaves the event's workspace first and then
  // calls dropEvent, or the workspace would flash "not found" while the
  // delete dialog is still being closed.
  async function deleteEvent(id: string): Promise<void> {
    await useApi().del(`/api/admin/events/${id}`)
  }

  function dropEvent(id: string) {
    events.value = events.value.filter((e) => e.id !== id)
  }

  function replaceEvent(ev: EventDto) {
    events.value = events.value.map((e) => (e.id === ev.id ? ev : e))
  }

  async function setTrialMode(id: string, enabled: boolean): Promise<EventDto> {
    const res = await useApi().request<EventDto>(`/api/admin/events/${id}/trial`, { method: 'PUT', body: { enabled } })
    replaceEvent(res)
    return res
  }

  async function setTableRange(id: string, range: TableRange): Promise<EventDto> {
    const res = await useApi().request<EventDto>(`/api/admin/events/${id}/tables`, { method: 'PUT', body: range })
    replaceEvent(res)
    return res
  }

  // Optional features (Pfand, helper meals) are saved with the event settings.
  async function setFeatures(id: string, features: Partial<Pick<EventDto, 'depositEnabled' | 'staffMealsEnabled'>>): Promise<void> {
    await useApi().patch(`/api/admin/events/${id}/branding`, features)
    const ev = events.value.find((e) => e.id === id)
    if (ev) replaceEvent({ ...ev, ...features })
  }

  async function deleteTrialData(id: string): Promise<TrialReset> {
    const res = await useApi().del<TrialReset>(`/api/admin/events/${id}/trial-data`)
    replaceEvent(res.event)
    return res
  }

  async function fetchMenuItems(eventId: string): Promise<void> {
    loading.value = true
    error.value = null
    if (menuEventId.value !== eventId) menuItems.value = []
    try {
      const api = useApi()
      const res = await api.get<AdminMenuList>(`/api/admin/events/${eventId}/menu-items`)
      menuEventId.value = res.eventId
      menuItems.value = res.items
    }
    catch (e) {
      error.value = e
      throw e
    }
    finally {
      loading.value = false
    }
  }

  async function createMenuItem(eventId: string, input: CreateMenuItem): Promise<AdminMenuItem> {
    const api = useApi()
    const res = await api.post<AdminMenuItem>(`/api/admin/events/${eventId}/menu-items`, input)
    menuItems.value = [...menuItems.value, res]
    return res
  }

  async function updateMenuItem(id: string, patch: UpdateMenuItem): Promise<AdminMenuItem> {
    const api = useApi()
    const res = await api.patch<AdminMenuItem>(`/api/admin/menu-items/${id}`, patch)
    menuItems.value = menuItems.value.map((m) => (m.id === id ? res : m))
    return res
  }

  async function toggleAvailability(id: string, isAvailable: boolean): Promise<void> {
    const original = menuItems.value.find((m) => m.id === id)
    if (!original) return
    menuItems.value = menuItems.value.map((m) =>
      m.id === id ? { ...m, isAvailable } : m,
    )
    try {
      const api = useApi()
      await api.patch<AdminMenuItem>(`/api/menu/${id}/availability`, { isAvailable })
    }
    catch (e) {
      menuItems.value = menuItems.value.map((m) =>
        m.id === id ? { ...m, isAvailable: original.isAvailable } : m,
      )
      error.value = e
      throw e
    }
  }

  async function downloadQrPdf(eventId: string, from: number, to: number): Promise<Blob> {
    const api = useApi()
    return await api.get<Blob>(`/api/admin/events/${eventId}/qr-codes?from=${from}&to=${to}`, {
      responseType: 'blob',
    })
  }

  async function downloadAllergenPdf(eventId: string): Promise<Blob> {
    return await useApi().get<Blob>(`/api/admin/events/${eventId}/allergens`, { responseType: 'blob' })
  }

  async function fetchBranding(eventId: string): Promise<Branding> {
    return await useApi().get<Branding>(`/api/admin/events/${eventId}/branding`)
  }

  async function saveBranding(eventId: string, patch: UpdateBranding): Promise<Branding> {
    return await useApi().patch<Branding>(`/api/admin/events/${eventId}/branding`, patch)
  }

  async function uploadAsset(eventId: string, kind: AssetKind, file: File): Promise<Branding> {
    const form = new FormData()
    form.append('file', file)
    return await useApi().request<Branding>(`/api/admin/events/${eventId}/assets/${kind}`, { method: 'PUT', body: form })
  }

  async function deleteAsset(eventId: string, kind: AssetKind): Promise<Branding> {
    return await useApi().del<Branding>(`/api/admin/events/${eventId}/assets/${kind}`)
  }

  async function downloadMenuTemplate(eventId: string): Promise<Blob> {
    return await useApi().get<Blob>(`/api/admin/events/${eventId}/menu-items/template`, { responseType: 'blob' })
  }

  async function importMenu(eventId: string, file: File, dryRun: boolean): Promise<MenuImportResult> {
    const form = new FormData()
    form.append('file', file)
    const result = await useApi().post<MenuImportResult>(`/api/admin/events/${eventId}/menu-items/import${dryRun ? '?dryRun=1' : ''}`, form)
    if (result.applied) await fetchMenuItems(eventId)
    return result
  }

  return {
    fetchBranding,
    saveBranding,
    uploadAsset,
    deleteAsset,
    downloadMenuTemplate,
    importMenu,
    events,
    menuItems,
    menuEventId,
    loading,
    error,
    fetchEvents,
    createEvent,
    activateEvent,
    fetchEndCheck,
    endEvent,
    deleteEvent,
    dropEvent,
    setTrialMode,
    setTableRange,
    setFeatures,
    deleteTrialData,
    fetchMenuItems,
    createMenuItem,
    updateMenuItem,
    toggleAvailability,
    downloadQrPdf,
    downloadAllergenPdf,
  }
})
