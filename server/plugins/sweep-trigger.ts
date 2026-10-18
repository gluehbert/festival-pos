import { defineNitroPlugin } from 'nitropack/runtime'
import { getDb } from '../db/client'
import { sweepIfDue } from '../lib/sweep'
import { log } from '../lib/log'

// How often one instance asks the database whether a sweep is due. This only
// saves round trips; the real throttle is the maintenance_runs row, which
// holds across all serverless instances and cold starts.
export const SWEEP_CHECK_MS = 5 * 60 * 1000

type GlobalWithSweep = typeof globalThis & { __posSweepCheckAt?: number }

// FR-043 + FR-053: hygiene sweep at most once per hour (SWEEP_INTERVAL_MS),
// triggered by API traffic but never awaited by it. The daily Vercel Cron
// (/api/cron/sweep, see vercel.json) covers quiet periods.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event) => {
    if (import.meta.prerender || !event.path.startsWith('/api/')) return
    const g = globalThis as GlobalWithSweep
    const now = Date.now()
    if (now < (g.__posSweepCheckAt ?? 0)) return
    g.__posSweepCheckAt = now + SWEEP_CHECK_MS
    const requestId = event.context.requestId as string | undefined
    const run = Promise.resolve()
      .then(() => sweepIfDue(getDb()))
      .then((result) => {
        if (result) log.info('sweep.ok', { requestId, route: 'plugin:sweep-trigger', ...result })
      })
      .catch((err: unknown) => {
        log.error('sweep.failed', {
          requestId,
          route: 'plugin:sweep-trigger',
          err: err instanceof Error ? err.message : String(err),
        })
      })
    // Keep the serverless function alive until the sweep has finished.
    event.waitUntil(run)
  })
})
