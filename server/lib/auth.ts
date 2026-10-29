import process from 'node:process'
import { SignJWT, jwtVerify } from 'jose'
import { deleteCookie, setCookie, type H3Event } from 'h3'
import { serverEnv } from './env'

export type StaffRole = 'admin' | 'lead' | 'waiter' | 'kitchen' | 'bar'

export interface StaffJwtPayload {
  staffId: string
  role: StaffRole
  username: string
}

// What the staff cookie carries. sessionVersion must match staff.session_version,
// which goes up when the secret, role or active flag changes: older tokens die.
export interface StaffTokenClaims extends StaffJwtPayload {
  sessionVersion: number
}

export interface GuestJwtPayload {
  sessionId: string
  eventId: string
  tableNo: number
}

const STAFF_COOKIE = 'pos_staff'
const GUEST_COOKIE = 'pos_guest'
// Waiting-room token of a helper who joined by link (lib/staff-join.ts).
const JOIN_COOKIE = 'pos_join'
const STAFF_MAX_AGE = 60 * 60 * 12
// A guest phone orders for one festival day; afterwards the QR code on the
// table has to be scanned again (lib/guest-session.ts).
const GUEST_MAX_AGE = 60 * 60 * 12
export const GUEST_SESSION_MS = GUEST_MAX_AGE * 1000

function getSecret(): Uint8Array {
  const secret = serverEnv().jwtSecret
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET is missing or too short (need >= 32 chars)')
  }
  return new TextEncoder().encode(secret)
}

// Empty COOKIE_DOMAIN (recommended) scopes cookies to the current host, which
// also keeps Vercel preview URLs working.
function cookieDomain(): string | undefined {
  const { cookieDomain } = serverEnv()
  return cookieDomain && cookieDomain !== 'localhost' ? cookieDomain : undefined
}

function cookieOptions(maxAge: number, httpOnly = true) {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly,
    sameSite: 'strict' as const,
    secure: isProd,
    path: '/',
    domain: cookieDomain(),
    maxAge,
  }
}

export async function signStaffJwt(payload: StaffTokenClaims): Promise<string> {
  const { sessionVersion, ...rest } = payload
  return await new SignJWT({ ...rest, sv: sessionVersion, kind: 'staff' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${STAFF_MAX_AGE}s`)
    .sign(getSecret())
}

export async function verifyStaffJwt(token: string): Promise<StaffTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.kind !== 'staff') {
    throw new Error('Wrong token kind')
  }
  return {
    staffId: String(payload.staffId),
    role: payload.role as StaffRole,
    username: String(payload.username),
    // Tokens from before session versions count as version 0.
    sessionVersion: Number(payload.sv ?? 0),
  }
}

export function setStaffCookie(event: H3Event, token: string): void {
  setCookie(event, STAFF_COOKIE, token, cookieOptions(STAFF_MAX_AGE))
}

export function clearStaffCookie(event: H3Event): void {
  deleteCookie(event, STAFF_COOKIE, { path: '/', domain: cookieDomain() })
}

export async function signGuestSession(payload: GuestJwtPayload): Promise<string> {
  return await new SignJWT({ ...payload, kind: 'guest' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${GUEST_MAX_AGE}s`)
    .sign(getSecret())
}

export async function verifyGuestSession(token: string): Promise<GuestJwtPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  if (payload.kind !== 'guest') {
    throw new Error('Wrong token kind')
  }
  return {
    sessionId: String(payload.sessionId),
    eventId: String(payload.eventId),
    tableNo: Number(payload.tableNo),
  }
}

export function setGuestCookie(event: H3Event, token: string): void {
  setCookie(event, GUEST_COOKIE, token, cookieOptions(GUEST_MAX_AGE))
}

export function clearGuestCookie(event: H3Event): void {
  deleteCookie(event, GUEST_COOKIE, { path: '/', domain: cookieDomain() })
}

export function setJoinCookie(event: H3Event, token: string): void {
  setCookie(event, JOIN_COOKIE, token, cookieOptions(STAFF_MAX_AGE))
}

export function clearJoinCookie(event: H3Event): void {
  deleteCookie(event, JOIN_COOKIE, { path: '/', domain: cookieDomain() })
}

export const cookieNames = { staff: STAFF_COOKIE, guest: GUEST_COOKIE, join: JOIN_COOKIE }
