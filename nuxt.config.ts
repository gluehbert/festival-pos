import process from 'node:process'

const appUrl = process.env.NUXT_PUBLIC_APP_URL ?? ''

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.svg' },
      ],
    },
  },
  routeRules: {
    // Pre-rendered so the service worker can serve it as navigation fallback.
    '/offline': { prerender: true },
    '/admin': { redirect: '/admin/events' },
  },
  // Light / dark is our own (app/composables/useTheme.ts), not @nuxtjs/color-mode.
  ui: { colorMode: false },
  // Icons ship inside the client bundle so they render offline (PWA) and never
  // hit the Iconify API. Lucide only, no emoji as icons (enforced in eslint.config.mjs).
  icon: { clientBundle: { scan: true }, fallbackToApi: false },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n', '@vite-pwa/nuxt', '@nuxt/eslint'],
  typescript: {
    strict: true,
    typeCheck: true,
  },
  nitro: {
    preset: 'vercel',
  },
  runtimeConfig: {
    // Read at runtime from JWT_SECRET / DATABASE_URL / COOKIE_DOMAIN (or the
    // NUXT_* equivalents), see server/lib/env.ts. Never baked into the build.
    jwtSecret: '',
    cookieDomain: '',
    databaseUrl: '',
    public: {
      appUrl,
      // Build shown in the header menu, so a device on an old deployment shows it.
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      // One-tap login buttons on preview deployments (server checks again).
      previewLogin: process.env.VERCEL_ENV === 'preview',
      pollingIntervals: {
        adminMs: 5000,
        guestMs: 8000,
        productionMs: 4000,
        staffMs: 4000,
      },
    },
  },
  i18n: {
    defaultLocale: 'en',
    // English by default; browsers that prefer German get German, the choice is remembered.
    detectBrowserLanguage: { useCookie: true, cookieKey: 'pos_locale', fallbackLocale: 'en' },
    lazy: true,
    // @ts-expect-error — runtime accepts `false` to disable the new i18n/ folder layout.
    restructureDir: false,
    langDir: 'app/i18n',
    locales: [
      { code: 'en', file: 'en.json', name: 'English' },
      { code: 'de', file: 'de.json', name: 'Deutsch' },
    ],
    strategy: 'no_prefix',
  },
  pwa: {
    // Never reload devices on their own mid-event (carts, half-typed orders):
    // the layout offers "Neu laden" when a new version is waiting.
    registerType: 'prompt',
    manifest: {
      name: 'Festival POS',
      short_name: 'Festival POS',
      description: 'Serverless Nuxt point-of-sale for club festivals.',
      theme_color: '#7c3aed',
      background_color: '#f8fafc',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      lang: 'en',
      icons: [
        {
          src: '/icons/icon-192.svg',
          sizes: '192x192',
          type: 'image/svg+xml',
        },
        {
          src: '/icons/icon-512.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
        },
        {
          src: '/icons/apple-touch-icon.svg',
          sizes: '180x180',
          type: 'image/svg+xml',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{css,html,ico,js,json,png,svg,txt,woff2}'],
      // No SPA navigateFallback: it would answer *every* navigation with the
      // offline page, even when online. Pages always come from the network;
      // only a failed navigation falls back to the pre-rendered /offline.
      navigateFallback: null,
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkOnly',
          options: { precacheFallback: { fallbackURL: '/offline' } },
        },
      ],
    },
  },
})
