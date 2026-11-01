import { describe, expect, it } from 'vitest'
import { apiErrorData, orderError } from '~/utils/order-error'
import { shouldRetry } from '~/utils/retry'

// What $fetch throws for an AppError: the body is { statusCode, data: payload }.
const wrapped = (statusCode: number, data: object) => ({ statusCode, data: { statusCode, data } })

describe('orderError', () => {
  it('recognises the open-limit error and exposes its details', () => {
    const e = wrapped(409, { code: 'OPEN_LIMIT', details: { station: 'bar', limitCents: 5000 } })
    expect(orderError(e)).toBe('openLimit')
    expect(apiErrorData(e).details).toEqual({ station: 'bar', limitCents: 5000 })
  })

  it('recognises the table rate limit and oversized orders', () => {
    expect(orderError(wrapped(429, { code: 'RATE_LIMITED' }))).toBe('tooMany')
    expect(orderError(wrapped(400, { code: 'ORDER_TOO_LARGE' }))).toBe('tooLarge')
  })

  it('still reads a flat payload', () => {
    expect(orderError({ statusCode: 409, data: { code: 'OPEN_LIMIT' } })).toBe('openLimit')
  })

  it('maps the remaining cases', () => {
    expect(orderError(new TypeError('Failed to fetch'))).toBe('network')
    expect(orderError(wrapped(401, {}))).toBe('sessionExpired')
    expect(orderError(wrapped(409, { code: 'SOLD_OUT', message: 'Item not available' }))).toBe('unavailable')
    expect(orderError(wrapped(500, { code: 'INTERNAL' }))).toBe('generic')
  })

  it('does not retry a wrapped RATE_LIMITED answer', () => {
    expect(shouldRetry(wrapped(429, { code: 'RATE_LIMITED' }))).toBe(false)
  })
})
