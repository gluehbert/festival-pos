import { defineEventHandler, getHeader, getRequestIP, readRawBody, setResponseStatus } from 'h3'
import { AppError, sendAppError } from '../../lib/errors'
import { log } from '../../lib/log'
import { MAX_ENVELOPE_BYTES, allowEnvelope, envelopeTarget } from '../../lib/sentry-tunnel'

// Tunnel for browser error reports, see lib/sentry-tunnel.ts. Open to guests
// and staff alike (an error can happen before sign-in); no CSRF token, the
// Sentry SDK cannot send one, but a foreign origin is refused.
export default defineEventHandler(async (event) => {
  try {
    const origin = getHeader(event, 'origin')
    if (origin && originHost(origin) !== getHeader(event, 'host')) {
      throw new AppError('FORBIDDEN', 403, 'Foreign origin')
    }
    const length = Number(getHeader(event, 'content-length') ?? 0)
    if (length > MAX_ENVELOPE_BYTES) throw new AppError('TOO_LARGE', 413, 'Envelope too large')
    const body = (await readRawBody(event, 'utf8')) ?? ''
    if (body.length > MAX_ENVELOPE_BYTES) throw new AppError('TOO_LARGE', 413, 'Envelope too large')
    const target = envelopeTarget(body)
    if (!allowEnvelope(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown')) {
      // Dropped quietly: the SDK would only retry a 429.
      setResponseStatus(event, 202)
      return { ok: true, dropped: true }
    }
    // Never forwards the client's IP, cookies or user agent.
    const status = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    }).then((res) => res.status, (err: unknown) => {
      // Not a failure of the app: do not report the reporter.
      log.warn('monitoring.forward_failed', {
        requestId: event.context.requestId as string | undefined,
        err: err instanceof Error ? err.message : String(err),
      })
      return 502
    })
    setResponseStatus(event, status === 429 ? 429 : 202)
    return { ok: status < 300 }
  }
  catch (err) {
    sendAppError(event, err)
  }
})

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host
  }
  catch {
    return null
  }
}
