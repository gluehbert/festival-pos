export type OrderError = 'network' | 'tooMany' | 'tooLarge' | 'openLimit' | 'sessionExpired' | 'unavailable' | 'generic'

export interface ApiErrorData {
  code?: string
  message?: string
  details?: { station?: string; limitCents?: number; menuItemIds?: string[] }
}

// Nitro wraps our error payload: the fetch error's `data` is the response
// body, and the payload sits in its own `data`. Accept both shapes.
export function apiErrorData(e: unknown): ApiErrorData {
  const body = (e as { data?: ApiErrorData & { data?: ApiErrorData } } | null)?.data
  return body?.data ?? body ?? {}
}

export function orderError(e: unknown): OrderError {
  const err = e as { statusCode?: number; status?: number }
  const status = err.statusCode ?? err.status
  if (status === undefined) return 'network'
  const data = apiErrorData(e)
  if (data.code === 'RATE_LIMITED') return 'tooMany'
  if (data.code === 'ORDER_TOO_LARGE') return 'tooLarge'
  if (data.code === 'OPEN_LIMIT') return 'openLimit'
  if (status === 401) return 'sessionExpired'
  if (/not available/i.test(data.message ?? '')) return 'unavailable'
  return 'generic'
}
