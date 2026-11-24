import process from 'node:process'
import * as Sentry from '@sentry/node'
import type { H3Event } from 'h3'
import { log } from './log'

// Error tracking with Sentry, off unless SENTRY_DSN is set (see DEPLOYMENT.md).
// Errors only: no tracing, no profiling, no request bodies, no IP addresses.
// Without a DSN every unexpected error still lands in the JSON log.

let enabled = false

// Drizzle puts the query parameters into the message ("params: …"); they can
// hold names or notes, so they never leave the server.
export function scrubMessage(message: string): string {
  return message.replace(/\nparams:[\s\S]*$/, '\nparams: [removed]')
}

// Query strings carry table keys and tokens (QR codes, join links).
export function stripQuery(url: string): string {
  const i = url.search(/[?#]/)
  return i === -1 ? url : url.slice(0, i)
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubMessage(ex.value)
  }
  if (event.message) event.message = scrubMessage(event.message)
  if (event.request) {
    event.request = { method: event.request.method, url: event.request.url ? stripQuery(event.request.url) : undefined }
  }
  delete event.user
  delete event.server_name
  return event
}

export function initServerMonitoring(dsn = process.env.SENTRY_DSN): boolean {
  if (enabled || !dsn) return enabled
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // No auto-instrumentation (http, pg, …): we report errors ourselves.
    skipOpenTelemetrySetup: true,
    defaultIntegrations: false,
    integrations: [Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
    beforeSend: scrubEvent,
  })
  enabled = true
  return true
}

const reported = new WeakSet<object>()

export function markReported(err: unknown): void {
  if (err && typeof err === 'object') reported.add(err)
}

export function wasReported(err: unknown): boolean {
  return !!err && typeof err === 'object' && reported.has(err)
}

// Logs the real cause of a 5xx (the client only sees "Internal Server Error")
// and sends it to Sentry when configured. The serverless function stays alive
// until the report is out.
export function reportServerError(event: H3Event | undefined, err: unknown, code = 'INTERNAL'): void {
  markReported(err)
  const requestId = event?.context.requestId as string | undefined
  const route = event ? stripQuery(event.path) : undefined
  const method = event?.method
  const message = scrubMessage(err instanceof Error ? err.message : String(err))
  log.error('request.failed', {
    requestId,
    route,
    method,
    code,
    staffId: event?.context.auth?.staff?.staffId,
    err: message,
    // Frames only: the first lines of a stack repeat the (unscrubbed) message.
    stack: err instanceof Error ? err.stack?.split('\n').filter((l) => l.trimStart().startsWith('at ')).slice(0, 5).join('\n') : undefined,
  })
  if (!enabled) return
  Sentry.withScope((scope) => {
    scope.setTag('code', code)
    if (requestId) scope.setTag('request_id', requestId)
    if (route) scope.setTag('route', route)
    if (method) scope.setTag('method', method)
    const role = event?.context.auth?.staff?.role ?? (event?.context.guest ? 'guest' : undefined)
    if (role) scope.setTag('role', role)
    Sentry.captureException(err)
  })
  const flush = Sentry.flush(2000).catch(() => false)
  event?.waitUntil?.(flush)
}
