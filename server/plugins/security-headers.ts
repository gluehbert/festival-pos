import process from 'node:process'
import { defineNitroPlugin } from 'nitropack/runtime'
import { setResponseHeader } from 'h3'
import { API_CSP, pageCsp } from '../lib/csp'

export default defineNitroPlugin((nitro) => {
  const isProd = process.env.NODE_ENV === 'production'

  nitro.hooks.hook('request', (event) => {
    if (isProd) {
      // No includeSubDomains/preload: the app may live on a shared club domain.
      setResponseHeader(event, 'Strict-Transport-Security', 'max-age=31536000')
      // JSON endpoints never need to run anything. Not applied to static
      // files: a service worker script is governed by its own CSP header.
      if (event.path.startsWith('/api/')) setResponseHeader(event, 'Content-Security-Policy', API_CSP)
    }
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    setResponseHeader(event, 'X-Frame-Options', 'DENY')
    setResponseHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
    setResponseHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  })

  // CSP is skipped in dev: Vite's HMR client injects scripts on the fly.
  nitro.hooks.hook('render:response', (response, { event }) => {
    if (!isProd || typeof response.body !== 'string') return
    setResponseHeader(event, 'Content-Security-Policy', pageCsp(response.body))
  })
})
