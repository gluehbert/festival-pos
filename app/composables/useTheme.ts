import { computed } from 'vue'
import { useCookie } from '#imports'
import { useApi } from './useApi'

export type Theme = 'system' | 'light' | 'dark'
export const THEMES: readonly Theme[] = ['system', 'light', 'dark']

const ONE_YEAR = 60 * 60 * 24 * 365

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEMES as readonly string[]).includes(v)
}

// Colour scheme of the UI. The cookie lets the server render <html
// data-theme> right away (no light flash on a dark device); for signed-in
// staff the choice is also stored on their account, so it follows them to
// every device. Guests keep it per device.
export function useTheme() {
  const cookie = useCookie<string | null>('pos_theme', {
    default: () => 'system',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    path: '/',
  })
  const theme = computed<Theme>(() => (isTheme(cookie.value) ? cookie.value : 'system'))

  // Applies a theme on this device only (e.g. the one loaded with a login).
  function apply(next: Theme) {
    cookie.value = next
  }

  // User picked a theme: apply it and, when signed in, save it to the account.
  async function choose(next: Theme, signedIn: boolean): Promise<void> {
    const previous = theme.value
    apply(next)
    if (!signedIn) return
    try {
      await useApi().put('/api/auth/theme', { theme: next })
    }
    catch {
      apply(previous)
    }
  }

  return { theme, apply, choose }
}
