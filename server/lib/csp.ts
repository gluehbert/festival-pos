import { createHash } from 'node:crypto'

// Executable inline <script> blocks (incl. importmap). JSON data blocks such
// as __NUXT_DATA__ are not executed and need no CSP allowance.
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi

export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>()
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const attrs = match[1] ?? ''
    if (/type=["']?application\/(ld\+)?json/i.test(attrs)) continue
    hashes.add(`'sha256-${createHash('sha256').update(match[2] ?? '').digest('base64')}'`)
  }
  return [...hashes]
}

// Strict policy for rendered pages: only same-origin scripts plus the exact
// inline scripts Nuxt rendered into this response. Styles keep
// 'unsafe-inline' (Vue style bindings, Nuxt UI color variables).
export function pageCsp(html: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

// API responses and files never need to execute anything or be framed.
export const API_CSP = "default-src 'none'; frame-ancestors 'none'"
