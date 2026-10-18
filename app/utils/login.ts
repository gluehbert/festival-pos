// Login helpers: what went wrong, and what this device remembers.

export type LoginKind = 'password' | 'pin'
export type LoginErrorKey = 'errorInvalid' | 'errorTooMany' | 'errorOffline'

// 401 = wrong credentials, 429 = locked out for a while. No answer at all or
// a 5xx is not the user's fault: telling them their PIN is wrong would make
// them doubt a correct PIN while the network is down.
export function loginErrorKey(e: unknown): LoginErrorKey {
  const err = e as { statusCode?: number; status?: number; response?: { status?: number } } | null
  const status = err?.statusCode ?? err?.status ?? err?.response?.status
  if (status === 429) return 'errorTooMany'
  if (status === undefined || status >= 500) return 'errorOffline'
  return 'errorInvalid'
}

// Shared festival devices: remember only the mode and the last username,
// never the secret. Storage may be blocked (private mode), so never throw.
const PREFS_KEY = 'staff-login'

export interface LoginPrefs {
  kind: LoginKind
  username: string
}

export function loadLoginPrefs(): LoginPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<LoginPrefs>
    return {
      kind: p.kind === 'pin' ? 'pin' : 'password',
      username: typeof p.username === 'string' ? p.username : '',
    }
  }
  catch {
    return null
  }
}

export function saveLoginPrefs(prefs: LoginPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }
  catch {
    // Not remembered on this device, login works anyway.
  }
}
