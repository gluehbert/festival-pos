// Automatic retry of calls that carry an idempotency key: the server returns
// the booking already made, so sending again is safe.
import { apiErrorData } from './order-error'

export const MAX_RETRIES = 4
export const ATTEMPT_TIMEOUT_MS = 10_000
// All attempts and waits together.
export const TOTAL_BUDGET_MS = 20_000

// Wait before retry n (0-based): 1, 2, 4, 8 s. Null when retries are used up.
export function nextDelay(retry: number): number | null {
  return retry < MAX_RETRIES ? 1000 * 2 ** retry : null
}

// Network error (no status), timeout or an overloaded server. Answers from
// the application (4xx, RATE_LIMITED, 500) are final.
export function shouldRetry(err: unknown): boolean {
  const e = err as { status?: number, statusCode?: number, response?: { status?: number } }
  const status = e.status ?? e.statusCode ?? e.response?.status
  if (status === undefined) return true
  if (status === 429) return apiErrorData(err).code !== 'RATE_LIMITED'
  return [408, 502, 503, 504].includes(status)
}
