import { and, count, eq, gt } from 'drizzle-orm'
import { getRequestIP, type H3Event } from 'h3'
import type { Db } from '../db/client'
import { loginAttempts } from '../db/schema-auth'
import { AppError } from './errors'

export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000
// A 4-digit PIN has 10k combinations. Failures count per username AND IP, so
// someone on the festival Wi-Fi typing wrong PINs blocks only their own
// device, not the waiter. The per-IP cap covers username spraying; the higher
// per-username cap bounds a brute force spread over many IPs (100 tries per
// window: > 100 h for all 10k PINs).
const MAX_FAILURES_PER_USER_AND_IP = 10
const MAX_FAILURES_PER_USER = 100
const MAX_FAILURES_PER_IP = 50

export function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}

export async function assertLoginAllowed(db: Db, username: string, ip: string): Promise<void> {
  const since = new Date(Date.now() - LOGIN_THROTTLE_WINDOW_MS)
  const [byUserAndIp] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.username, username), eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, since)))
  const [byUser] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.username, username), gt(loginAttempts.createdAt, since)))
  const [byIp] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, since)))
  if (
    Number(byUserAndIp?.n ?? 0) >= MAX_FAILURES_PER_USER_AND_IP
    || Number(byUser?.n ?? 0) >= MAX_FAILURES_PER_USER
    || Number(byIp?.n ?? 0) >= MAX_FAILURES_PER_IP
  ) {
    throw new AppError('RATE_LIMITED', 429, 'Too many failed login attempts, try again later', {
      retryAfterSeconds: LOGIN_THROTTLE_WINDOW_MS / 1000,
    })
  }
}

export async function recordLoginFailure(db: Db, username: string, ip: string): Promise<void> {
  await db.insert(loginAttempts).values({ username, ip })
}

// Only this device's failures: a successful login must not reset the count
// of someone guessing the same account from elsewhere.
export async function clearLoginFailures(db: Db, username: string, ip: string): Promise<void> {
  await db.delete(loginAttempts).where(and(eq(loginAttempts.username, username), eq(loginAttempts.ip, ip)))
}

// Wrong guest table keys / event PINs, counted per IP under a reserved name
// (usernames cannot contain ':').
const GUEST_PIN_USER = 'guest:pin'
const MAX_GUEST_FAILURES_PER_IP = 20

export async function assertGuestPinAllowed(db: Db, ip: string): Promise<void> {
  const since = new Date(Date.now() - LOGIN_THROTTLE_WINDOW_MS)
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.username, GUEST_PIN_USER), eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, since)))
  if (Number(row?.n ?? 0) >= MAX_GUEST_FAILURES_PER_IP) {
    throw new AppError('RATE_LIMITED', 429, 'Too many wrong codes, try again later', {
      retryAfterSeconds: LOGIN_THROTTLE_WINDOW_MS / 1000,
    })
  }
}

export async function recordGuestPinFailure(db: Db, ip: string): Promise<void> {
  await recordLoginFailure(db, GUEST_PIN_USER, ip)
}
