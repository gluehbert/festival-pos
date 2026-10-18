import { useCookie, navigateTo } from '#imports'
import type { FetchOptions } from 'ofetch'

interface ApiOptions extends FetchOptions {
  retries?: number
}

async function ensureCsrfToken(): Promise<string> {
  const cookie = useCookie<string | null>('csrf', { default: () => null })
  if (cookie.value && cookie.value.length >= 32) return cookie.value
  const res = await $fetch<{ csrfToken: string }>('/api/csrf-token', { credentials: 'include' })
  cookie.value = res.csrfToken
  return res.csrfToken
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Pages behind the staff login. The join page is for people without an
// account yet: a 401 there must not send them to the login.
const STAFF_AREAS = /^\/(?!staff\/join\/)(staff|admin|production)(\/|$)/

export function useApi() {
  // Requests are same-origin (no baseURL): the API is served by the same
  // deployment, which also keeps Vercel preview URLs working.

  async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
    const method = (opts.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = {
      ...(opts.headers as Record<string, string> | undefined),
    }

    if (MUTATING.has(method)) {
      headers['x-csrf-token'] = await ensureCsrfToken()
    }

    const maxRetries = opts.retries ?? 3
    let attempt = 0
    while (true) {
      try {
        return await ($fetch as <R>(req: string, opts?: unknown) => Promise<R>)<T>(path, {
          credentials: 'include',
          ...opts,
          headers,
          method,
        })
      }
      catch (err: unknown) {
        const e = err as { status?: number; statusCode?: number; response?: { status?: number; headers?: Headers } }
        const status = e.status ?? e.statusCode ?? e.response?.status
        if (status === 401) {
          // Only staff screens have a login. Guests get a fresh session from
          // their table page, so they must not be sent to the staff login.
          if (import.meta.client && STAFF_AREAS.test(window.location.pathname)) await navigateTo('/staff/login')
          throw err
        }
        if (status === 403) {
          throw err
        }
        if (status === 503 && attempt < maxRetries) {
          const retryAfter = Number(e.response?.headers?.get('retry-after') ?? '1')
          const delay = Math.min(1000 * 2 ** attempt + retryAfter * 1000, 8000)
          await new Promise((r) => setTimeout(r, delay))
          attempt++
          continue
        }
        throw err
      }
    }
  }

  return {
    request,
    get: <T>(path: string, opts?: ApiOptions) => request<T>(path, { ...opts, method: 'GET' }),
    post: <T>(path: string, body?: unknown, opts?: ApiOptions) => request<T>(path, { ...opts, method: 'POST', body: body as ApiOptions['body'] }),
    put: <T>(path: string, body?: unknown, opts?: ApiOptions) => request<T>(path, { ...opts, method: 'PUT', body: body as ApiOptions['body'] }),
    patch: <T>(path: string, body?: unknown, opts?: ApiOptions) => request<T>(path, { ...opts, method: 'PATCH', body: body as ApiOptions['body'] }),
    del: <T>(path: string, opts?: ApiOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
  }
}

// re-exported for tests
export { ensureCsrfToken }
