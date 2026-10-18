import { ref } from 'vue'
import { navigateTo } from '#imports'
import { useAuthStore } from '~/stores/auth'
import type { EventDto } from '~/../server/lib/contracts/admin'

// Sends anyone but a signed-in admin away. Resolves true when the page may load.
export async function ensureAdmin(): Promise<boolean> {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    const me = await auth.refresh()
    if (!me) {
      await navigateTo('/staff/login')
      return false
    }
  }
  if (auth.staff?.role !== 'admin') {
    await navigateTo('/staff')
    return false
  }
  return true
}

export interface AdminToast { kind: 'success' | 'error'; text: string }

// One toast shared by the admin pages and the event workspace tabs.
const toast = ref<AdminToast | null>(null)

export function useAdminToast() {
  function show(kind: AdminToast['kind'], text: string) {
    toast.value = { kind, text }
    setTimeout(() => {
      if (toast.value?.text === text) toast.value = null
    }, 2500)
  }
  return {
    toast,
    show,
    success: (text: string) => show('success', text),
    failure: (text: string) => show('error', text),
  }
}

// draft: never activated · live: active · trial: active rehearsal · ended: was active once
export type EventStatus = 'draft' | 'live' | 'trial' | 'ended'

export function eventStatus(ev: Pick<EventDto, 'isActive' | 'trialMode' | 'activatedAt'>): EventStatus {
  if (ev.isActive) return ev.trialMode ? 'trial' : 'live'
  return ev.activatedAt ? 'ended' : 'draft'
}
