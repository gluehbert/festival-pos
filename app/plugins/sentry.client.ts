import { NETWORK_NOISE, scrubBreadcrumb, scrubBrowserEvent } from '~/utils/sentry-scrub'

// Browser errors to Sentry, only when SENTRY_DSN was set at build time.
// Errors only: no tracing, no session replay, no session pings. Reports go
// through our own server (/api/monitoring/sentry), so Sentry never sees the
// guest's IP. Query strings (table keys, join tokens) are cut off.

// Staff screens keep reports in IndexedDB while the festival Wi-Fi is down and
// send them later. Guest phones do not store anything for this.
const STAFF_PATHS = /^\/(staff|production|admin)(\/|$)/

export default defineNuxtPlugin({
  name: 'sentry',
  parallel: true,
  setup(nuxtApp) {
    const config = useRuntimeConfig().public
    const dsn = config.sentryDsn as string
    if (!dsn) return
    const staffDevice = STAFF_PATHS.test(window.location.pathname)
    // Loaded on demand, so the bundle stays the same without a DSN.
    void import('@sentry/vue').then((Sentry) => {
      Sentry.init({
        app: nuxtApp.vueApp,
        dsn,
        tunnel: '/api/monitoring/sentry',
        environment: config.sentryEnvironment as string,
        release: config.version as string,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        ignoreErrors: NETWORK_NOISE,
        integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserSession'),
        ...(staffDevice ? { transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport) } : {}),
        beforeBreadcrumb: scrubBreadcrumb,
        beforeSend: scrubBrowserEvent,
      })
      Sentry.setTag('device', staffDevice ? 'staff' : 'guest')
    })
  },
})
