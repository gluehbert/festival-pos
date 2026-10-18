import { describe, expect, it } from 'vitest'
import { sendAppError } from '../../server/lib/errors'
import { makeEvent } from '../setup/h3-event'

// T125: Ensure DB connection-limit-style errors map to a 503 with the
// documented envelope and a Retry-After response header (NFR-002 + spec edge
// case "DB connection limit reached").
describe('errors — 503 retry envelope', () => {
  it('maps a "too many connections" error to 503 + Retry-After: 1 + DB_BUSY envelope', () => {
    const { event, getHeader } = makeEvent({ method: 'POST' })
    let caught: unknown
    try {
      sendAppError(event, new Error('FATAL: too many connections for role'))
    }
    catch (err) {
      caught = err
    }
    const e = caught as { statusCode: number; data: { code: string; message: string; retryAfterSeconds?: number } }
    expect(e.statusCode).toBe(503)
    expect(e.data.code).toBe('DB_BUSY')
    expect(typeof e.data.message).toBe('string')
    expect(e.data.retryAfterSeconds).toBe(1)
    expect(String(getHeader('Retry-After'))).toBe('1')
  })

  it('does not set Retry-After for unrelated errors', () => {
    const { event, getHeader } = makeEvent({ method: 'POST' })
    try { sendAppError(event, new Error('boom')) } catch { /* expected */ }
    expect(getHeader('Retry-After')).toBeUndefined()
  })
})
