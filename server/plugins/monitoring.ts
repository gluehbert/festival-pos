import { defineNitroPlugin } from 'nitropack/runtime'
import { initServerMonitoring, reportServerError, wasReported } from '../lib/monitoring'

// Starts Sentry when SENTRY_DSN is set and reports 5xx errors that did not go
// through sendAppError (a handler without try/catch, a crashing plugin).
// 4xx are expected answers (wrong PIN, sold out) and never reported.
export default defineNitroPlugin((nitro) => {
  if (import.meta.prerender) return
  initServerMonitoring()
  nitro.hooks.hook('error', (error, { event }) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (status < 500 || wasReported(error)) return
    const cause = (error as { cause?: unknown }).cause
    if (cause && wasReported(cause)) return
    reportServerError(event, cause ?? error)
  })
})
