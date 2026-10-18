import { getHeader, type H3Event } from 'h3'

export function getIdempotencyKey(event: H3Event): string | null {
  const value = getHeader(event, 'idempotency-key') ?? getHeader(event, 'Idempotency-Key')
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length > 200) return null
  return trimmed.length > 0 ? trimmed : null
}
