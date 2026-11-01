import { describe, expect, it } from 'vitest'
import { apiError } from '~/utils/api-error'
import { orderError } from '~/utils/order-error'
import { apiFailure } from './setup/api-error'

describe('apiError', () => {
  it('reads the AppError payload from where the server puts it', () => {
    expect(apiError(apiFailure(409, 'TABLES_OPEN', { message: 'open', details: { tableNos: [11] } })))
      .toEqual({ code: 'TABLES_OPEN', message: 'open', details: { tableNos: [11] } })
  })

  it('is empty without an answer from the app', () => {
    expect(apiError(new TypeError('Failed to fetch'))).toEqual({})
    expect(apiError({ statusCode: 502, data: '<html>Bad Gateway</html>' })).toEqual({})
    expect(apiError(null)).toEqual({})
  })
})

describe('orderError', () => {
  it('names the reason a guest order failed', () => {
    expect(orderError(new TypeError('Failed to fetch'))).toBe('network')
    expect(orderError(apiFailure(429, 'RATE_LIMITED'))).toBe('tooMany')
    expect(orderError(apiFailure(400, 'ORDER_TOO_LARGE'))).toBe('tooLarge')
    expect(orderError(apiFailure(409, 'OPEN_LIMIT'))).toBe('openLimit')
    expect(orderError(apiFailure(409, 'SOLD_OUT'))).toBe('unavailable')
    expect(orderError(apiFailure(401, 'UNAUTHORIZED'))).toBe('sessionExpired')
    expect(orderError(apiFailure(500, 'INTERNAL'))).toBe('generic')
  })
})
