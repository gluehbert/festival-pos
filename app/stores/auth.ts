import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { useApi } from '~/composables/useApi'
import { apiError } from '~/utils/api-error'
import { useTheme, type Theme } from '~/composables/useTheme'

export type StaffRole = 'admin' | 'lead' | 'waiter' | 'kitchen' | 'bar' | 'cafe'

export interface StaffSession {
  staffId: string
  username: string
  role: StaffRole
  theme: Theme
}

export interface LoginCredentials {
  username: string
  secret: string
  kind: 'password' | 'pin'
}

// Start page after login: everyone lands where their work is.
export function homeForRole(role: StaffRole | undefined): string {
  if (role === 'admin') return '/admin/events'
  if (role === 'kitchen' || role === 'bar' || role === 'cafe') return '/production'
  return '/staff'
}

export const useAuthStore = defineStore('auth', () => {
  const staff = ref<StaffSession | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const { apply: applyTheme } = useTheme()

  async function login(creds: LoginCredentials): Promise<StaffSession> {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const res = await api.post<StaffSession>('/api/auth/login', creds)
      staff.value = res
      applyTheme(res.theme)
      return res
    }
    catch (e: unknown) {
      const data = (e as { data?: { message?: string } })?.data
      error.value = data?.message ?? 'login_failed'
      throw e
    }
    finally {
      loading.value = false
    }
  }

  // No username: the device offers the passkeys it holds for this site and
  // unlocks the chosen one (fingerprint, face, device PIN, password manager).
  async function loginWithPasskey(): Promise<StaffSession> {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const optionsJSON = await api.post<PublicKeyCredentialRequestOptionsJSON>('/api/auth/passkeys/login-options')
      const response = await startAuthentication({ optionsJSON })
      const res = await api.post<StaffSession>('/api/auth/passkeys/login', { response })
      staff.value = res
      applyTheme(res.theme)
      return res
    }
    finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      const api = useApi()
      await api.post('/api/auth/logout')
    }
    finally {
      staff.value = null
      // Devices are shared at the festival: the next person starts neutral.
      applyTheme('system')
    }
  }

  async function refresh(): Promise<StaffSession | null> {
    try {
      const api = useApi()
      const res = await api.get<StaffSession>('/api/auth/me')
      staff.value = res
      applyTheme(res.theme)
      return res
    }
    catch (e) {
      // Only a 401 ends the session; a 503 (database down) keeps who is logged in.
      const status = (e as { status?: number; statusCode?: number }).status ?? (e as { statusCode?: number }).statusCode
      if (status === 401 || status === 403) staff.value = null
      return staff.value
    }
  }

  // Own password ("Mein Konto"). The server keeps this device signed in.
  async function changePassword(current: string, next: string): Promise<'ok' | 'wrong' | 'rateLimited' | 'failed'> {
    try {
      await useApi().post('/api/auth/password', { current, next })
      return 'ok'
    }
    catch (e) {
      const status = (e as { status?: number; statusCode?: number }).status ?? (e as { statusCode?: number }).statusCode
      if (status === 429) return 'rateLimited'
      return apiError(e).code === 'WRONG_SECRET' ? 'wrong' : 'failed'
    }
  }

  function hasRole(role: StaffRole | StaffRole[]): boolean {
    if (!staff.value) return false
    return Array.isArray(role) ? role.includes(staff.value.role) : staff.value.role === role
  }

  return {
    staff,
    loading,
    error,
    isAuthenticated: computed(() => staff.value !== null),
    login,
    loginWithPasskey,
    logout,
    refresh,
    changePassword,
    hasRole,
  }
})
