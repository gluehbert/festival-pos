import { apiError } from './api-error'

export type OrderError = 'network' | 'tooMany' | 'tooLarge' | 'openLimit' | 'sessionExpired' | 'unavailable' | 'generic'

// Why a guest order failed; picks the message shown under the cart.
export function orderError(e: unknown): OrderError {
  const err = e as { statusCode?: number; status?: number }
  const status = err.statusCode ?? err.status
  if (status === undefined) return 'network'
  const { code } = apiError(e)
  if (code === 'RATE_LIMITED') return 'tooMany'
  if (code === 'ORDER_TOO_LARGE') return 'tooLarge'
  if (code === 'OPEN_LIMIT') return 'openLimit'
  if (code === 'SOLD_OUT') return 'unavailable'
  if (status === 401) return 'sessionExpired'
  return 'generic'
}
