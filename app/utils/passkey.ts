// Passkey helpers for the client: support, a default device name, error
// texts and whether to offer setting one up after a PIN/password login.
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { loginErrorKey } from './login'

export function passkeysSupported(): boolean {
  try {
    return browserSupportsWebAuthn()
  }
  catch {
    return false
  }
}

// Shown in the device lists until renamed: "iPhone", "Android", ...
export function devicePlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Browser'
}

export type PasskeyErrorKey = 'cancelled' | 'alreadyRegistered' | 'errorInvalid' | 'errorTooMany' | 'errorOffline'

// The browser reports a closed or timed-out dialog as NotAllowedError: that is
// no error for the user, just "not now".
export function passkeyErrorKey(e: unknown): PasskeyErrorKey {
  const name = (e as { name?: string } | null)?.name
  const code = (e as { code?: string } | null)?.code
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') return 'cancelled'
  if (name === 'InvalidStateError' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'alreadyRegistered'
  const status = (e as { statusCode?: number; status?: number } | null)
  if (status?.statusCode === 409 || status?.status === 409) return 'alreadyRegistered'
  return loginErrorKey(e)
}

// Per username on this device: 'done' = a passkey was set up here, 'never' =
// the user does not want to be asked again. Storage may be blocked.
const OFFER_KEY = 'passkey-offer'

function readOffers(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OFFER_KEY)
    const parsed = raw ? JSON.parse(raw) as unknown : {}
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  }
  catch {
    return {}
  }
}

export function markPasskeyOffer(username: string, state: 'done' | 'never'): void {
  try {
    localStorage.setItem(OFFER_KEY, JSON.stringify({ ...readOffers(), [username]: state }))
  }
  catch {
    // Asked again next time, nothing breaks.
  }
}

// Only the club's admins get the offer. Waiters and shift leads are
// volunteers who sign in once a year; kitchen and bar work on shared tablets,
// where anyone who can unlock the tablet could use a stored passkey. Everyone
// still finds passkeys in their account.
export function shouldOfferPasskey(username: string, role: string | undefined): boolean {
  if (role !== 'admin') return false
  if (!passkeysSupported()) return false
  return readOffers()[username] === undefined
}
