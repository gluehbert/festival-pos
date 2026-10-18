import process from 'node:process'
import { useRuntimeConfig } from '#imports'

// Server settings are read at request time. Nuxt's runtimeConfig only picks up
// NUXT_* variables at runtime, so the documented plain names (JWT_SECRET,
// DATABASE_URL, COOKIE_DOMAIN) are read from process.env as a fallback. This
// also keeps secrets out of the build output.
export function serverEnv(): { jwtSecret: string; databaseUrl: string; cookieDomain: string } {
  const config = useRuntimeConfig()
  return {
    jwtSecret: config.jwtSecret || process.env.JWT_SECRET || '',
    databaseUrl: config.databaseUrl || process.env.DATABASE_URL || '',
    cookieDomain: config.cookieDomain || process.env.COOKIE_DOMAIN || '',
  }
}
