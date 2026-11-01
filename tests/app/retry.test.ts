import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextDelay, shouldRetry, MAX_RETRIES } from '~/utils/retry'
import { useApi } from '~/composables/useApi'
import { useCookie } from './setup/imports'
import { apiFailure } from './setup/api-error'

describe('shouldRetry', () => {
  it('retries network errors and transient statuses', () => {
    expect(shouldRetry(new TypeError('Failed to fetch'))).toBe(true)
    for (const statusCode of [408, 502, 503, 504]) expect(shouldRetry({ statusCode })).toBe(true)
    expect(shouldRetry({ status: 429 })).toBe(true)
  })

  it('never retries answers from the application', () => {
    expect(shouldRetry(apiFailure(429, 'RATE_LIMITED'))).toBe(false)
    for (const statusCode of [400, 401, 403, 404, 409, 500]) expect(shouldRetry({ statusCode })).toBe(false)
  })
})

describe('nextDelay', () => {
  it('doubles from one second and ends after four retries', () => {
    expect([0, 1, 2, 3].map(nextDelay)).toEqual([1000, 2000, 4000, 8000])
    expect(nextDelay(MAX_RETRIES)).toBeNull()
  })
})

describe('useApi retry', () => {
  const fetchMock = vi.fn()
  const idem = { headers: { 'idempotency-key': 'k1' } }
  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries a keyed call after network errors with the same key and reports attempts', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('x')).mockRejectedValueOnce(new TypeError('x')).mockResolvedValueOnce({ ok: 1 })
    const onAttempt = vi.fn()
    const p = useApi().post('/api/orders', { a: 1 }, { ...idem, onAttempt })
    await vi.advanceTimersByTimeAsync(3000)
    await expect(p).resolves.toEqual({ ok: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const keys = fetchMock.mock.calls.map((c) => (c[1] as { headers: Record<string, string> }).headers['idempotency-key'])
    expect(keys).toEqual(['k1', 'k1', 'k1'])
    expect(onAttempt.mock.calls).toEqual([[1, 4], [2, 4]])
  })

  it('gives up after four retries with the last error', async () => {
    fetchMock.mockRejectedValue(new TypeError('down'))
    const p = useApi().post('/api/orders', {}, idem)
    const caught = p.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(16000)
    expect(await caught).toBeInstanceOf(TypeError)
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('does not retry a business error or a call without key', async () => {
    fetchMock.mockRejectedValue(apiFailure(409, 'LOCK_CONFLICT'))
    await expect(useApi().post('/api/payments', {}, idem)).rejects.toMatchObject({ statusCode: 409 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockReset().mockRejectedValue(new TypeError('x'))
    await expect(useApi().post('/api/other', {})).rejects.toBeInstanceOf(TypeError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops when the signal is aborted', async () => {
    fetchMock.mockRejectedValue(new TypeError('x'))
    const ctrl = new AbortController()
    const caught = useApi().post('/api/orders', {}, { ...idem, signal: ctrl.signal }).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(100)
    ctrl.abort()
    await vi.advanceTimersByTimeAsync(20000)
    expect(await caught).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts an attempt that hangs for 10 seconds and retries', async () => {
    fetchMock.mockImplementationOnce((_p: string, o: { signal: AbortSignal }) => new Promise((_res, rej) => {
      o.signal.addEventListener('abort', () => rej(new Error('aborted')))
    })).mockResolvedValueOnce({ ok: 2 })
    const p = useApi().post('/api/orders', {}, idem)
    await vi.advanceTimersByTimeAsync(11500)
    await expect(p).resolves.toEqual({ ok: 2 })
  })
})
