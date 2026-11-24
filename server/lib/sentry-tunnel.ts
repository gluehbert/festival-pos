import process from 'node:process'
import { AppError } from './errors'

// Browser error reports go to our own origin first (/api/monitoring/sentry)
// and are passed on from here: Sentry never sees a guest's IP address, the
// strict CSP (connect-src 'self') stays as it is and ad blockers do not drop
// the reports. Only envelopes for our own DSN are forwarded.

export const MAX_ENVELOPE_BYTES = 200_000
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 30

interface Dsn { host: string; projectId: string; publicKey: string }

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '')
    if (url.protocol !== 'https:' || !url.username || !/^\d+$/.test(projectId)) return null
    return { host: url.host, projectId, publicKey: url.username }
  }
  catch {
    return null
  }
}

// The upstream URL for an envelope, or an AppError when it is not ours.
export function envelopeTarget(envelope: string, configured = process.env.SENTRY_DSN): string {
  const ours = parseDsn(configured)
  if (!ours) throw new AppError('MONITORING_OFF', 404, 'Error tracking is not configured')
  const firstLine = envelope.slice(0, envelope.indexOf('\n') === -1 ? undefined : envelope.indexOf('\n'))
  let header: { dsn?: unknown }
  try {
    header = JSON.parse(firstLine) as { dsn?: unknown }
  }
  catch {
    throw new AppError('VALIDATION', 400, 'Invalid envelope')
  }
  const theirs = parseDsn(typeof header.dsn === 'string' ? header.dsn : undefined)
  if (!theirs || theirs.host !== ours.host || theirs.projectId !== ours.projectId || theirs.publicKey !== ours.publicKey) {
    throw new AppError('VALIDATION', 400, 'Unknown DSN')
  }
  return `https://${ours.host}/api/${ours.projectId}/envelope/`
}

// A crash loop on one phone must not use up the monthly Sentry quota. Per
// serverless instance only, which is enough to stop a single runaway device.
const hits = new Map<string, { start: number; count: number }>()

export function allowEnvelope(key: string, now = Date.now()): boolean {
  const hit = hits.get(key)
  if (!hit || now - hit.start > WINDOW_MS) {
    if (hits.size > 5000) hits.clear()
    hits.set(key, { start: now, count: 1 })
    return true
  }
  hit.count++
  return hit.count <= MAX_PER_WINDOW
}
