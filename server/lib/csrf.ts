import { randomBytes, timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { getCookie, getHeader, getMethod, setCookie, type H3Event } from 'h3'
import { AppError } from './errors'

const CSRF_COOKIE = 'csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function issueCsrfToken(event: H3Event): string {
  const token = randomBytes(32).toString('hex')
  const isProd = process.env.NODE_ENV === 'production'
  setCookie(event, CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return token
}

export function assertCsrf(event: H3Event): void {
  const method = (getMethod(event) || 'GET').toUpperCase()
  if (SAFE_METHODS.has(method)) return

  const cookieToken = getCookie(event, CSRF_COOKIE)
  const headerToken = getHeader(event, 'x-csrf-token') ?? getHeader(event, 'X-CSRF-Token')

  if (!cookieToken || !headerToken) {
    throw new AppError('CSRF_INVALID', 403, 'Missing CSRF token')
  }
  const a = Buffer.from(cookieToken)
  const b = Buffer.from(headerToken)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('CSRF_INVALID', 403, 'Invalid CSRF token')
  }
}

export const csrfCookieName = CSRF_COOKIE
