import { apiError } from '~/utils/api-error'

// Why a poll failed, so the screen can say more than "no connection".
export type SyncErrorKind = 'offline' | 'noEvent' | 'schema' | 'server'

export function syncErrorKind(e: unknown): SyncErrorKind {
  const err = e as { status?: number; statusCode?: number } | null | undefined
  const status = err?.status ?? err?.statusCode
  if (status === undefined) return 'offline'
  if (apiError(e).code === 'SCHEMA_MISMATCH') return 'schema'
  if (status === 404) return 'noEvent'
  return 'server'
}
