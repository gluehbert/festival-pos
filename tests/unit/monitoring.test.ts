import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError, sendAppError } from '../../server/lib/errors'
import { scrubMessage, stripQuery, wasReported } from '../../server/lib/monitoring'
import { allowEnvelope, envelopeTarget, parseDsn } from '../../server/lib/sentry-tunnel'
import { scrubBreadcrumb, scrubBrowserEvent } from '../../app/utils/sentry-scrub'
import { makeEvent } from '../setup/h3-event'

const DSN = 'https://abc123@o42.ingest.de.sentry.io/4507'
const envelope = (dsn: string) => `${JSON.stringify({ dsn, sent_at: '2026-07-04T18:00:00Z' })}\n{"type":"event"}\n{}`

afterEach(() => vi.restoreAllMocks())

describe('server error log', () => {
  it('logs the real cause of a 500 with request id and route, without query or params', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { event } = makeEvent({ method: 'POST', url: '/api/orders?key=secret' })
    event.context.requestId = 'req-1'
    let thrown: unknown
    try {
      sendAppError(event, new Error('Failed query: insert into orders\nparams: Anna,ohne Zwiebeln'))
    }
    catch (err) {
      thrown = err
    }
    expect(thrown).toMatchObject({ statusCode: 500 })
    expect(wasReported(thrown)).toBe(true)
    const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, string>
    expect(line).toMatchObject({ level: 'error', msg: 'request.failed', requestId: 'req-1', route: '/api/orders', method: 'POST', code: 'INTERNAL' })
    expect(line.err).toContain('Failed query: insert into orders')
    expect(JSON.stringify(line)).not.toContain('Anna')
    expect(JSON.stringify(line)).not.toContain('secret')
  })

  it('does not log expected answers such as 404', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { event } = makeEvent()
    expect(() => sendAppError(event, new AppError('NOT_FOUND', 404, 'nope'))).toThrow()
    expect(spy).not.toHaveBeenCalled()
  })

  it('helpers cut query strings and query parameters', () => {
    expect(stripQuery('/t/3?key=abc#x')).toBe('/t/3')
    expect(stripQuery('/api/orders')).toBe('/api/orders')
    expect(scrubMessage('boom')).toBe('boom')
    expect(scrubMessage('Failed query: select 1\nparams: a,b')).toBe('Failed query: select 1\nparams: [removed]')
  })
})

describe('sentry tunnel', () => {
  it('parses DSNs and rejects broken ones', () => {
    expect(parseDsn(DSN)).toEqual({ host: 'o42.ingest.de.sentry.io', projectId: '4507', publicKey: 'abc123' })
    expect(parseDsn('http://abc@host/1')).toBeNull()
    expect(parseDsn('not a url')).toBeNull()
    expect(parseDsn(undefined)).toBeNull()
  })

  it('forwards only envelopes for our own DSN', () => {
    expect(envelopeTarget(envelope(DSN), DSN)).toBe('https://o42.ingest.de.sentry.io/api/4507/envelope/')
    expect(() => envelopeTarget(envelope('https://other@o42.ingest.de.sentry.io/4507'), DSN)).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => envelopeTarget(envelope('https://abc123@evil.example/4507'), DSN)).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => envelopeTarget('garbage', DSN)).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => envelopeTarget(envelope(DSN), '')).toThrow(expect.objectContaining({ status: 404 }))
  })

  it('limits envelopes per sender and minute', () => {
    const now = 1_000_000
    let allowed = 0
    for (let i = 0; i < 40; i++) if (allowEnvelope('10.0.0.1', now)) allowed++
    expect(allowed).toBe(30)
    expect(allowEnvelope('10.0.0.2', now)).toBe(true)
    expect(allowEnvelope('10.0.0.1', now + 61_000)).toBe(true)
  })
})

describe('browser report scrubbing', () => {
  it('cuts query strings from breadcrumbs and the page URL, drops the user', () => {
    expect(scrubBreadcrumb({ category: 'fetch', data: { url: '/api/session?key=k', method: 'POST' } })?.data)
      .toEqual({ url: '/api/session', method: 'POST' })
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/t/3?key=a', to: '/t/3/order' } })?.data)
      .toEqual({ from: '/t/3', to: '/t/3/order' })
    const ev = scrubBrowserEvent({
      type: undefined,
      request: { url: 'https://pos.example/t/3?key=abc', headers: { Referer: 'https://pos.example/?table=3&key=abc' } },
      user: { ip_address: '1.2.3.4' },
    })
    expect(ev.request?.url).toBe('https://pos.example/t/3')
    expect(ev.request?.headers?.Referer).toBe('https://pos.example/')
    expect(ev.user).toBeUndefined()
  })
})
