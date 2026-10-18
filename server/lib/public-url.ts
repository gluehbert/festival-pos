import { getRequestURL, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'

// Base URL for links that leave the admin's device (table QR codes, the
// helpers' join link): NUXT_PUBLIC_APP_URL always wins, else the address the
// admin is using. Wrong links? Check NUXT_PUBLIC_APP_URL in Vercel first.
export function publicBaseUrl(event: H3Event): string {
  const cfg = useRuntimeConfig() as { public: { appUrl?: string } }
  return cfg.public.appUrl || getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
}
