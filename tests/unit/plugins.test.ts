import process from 'node:process'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { makeEvent } from '../setup/h3-event'

type Hook = (event: H3Event) => void

async function loadHooks(path: string): Promise<Record<string, (...args: never[]) => void>> {
  const mod = await import(path) as { default: (nitro: unknown) => void }
  const hooks: Record<string, (...args: never[]) => void> = {}
  mod.default({ hooks: { hook: (name: string, fn: (...args: never[]) => void) => { hooks[name] = fn } } })
  return hooks
}

async function loadPlugin(path: string): Promise<Hook> {
  return (await loadHooks(path)).request as unknown as Hook
}

beforeAll(() => {
  vi.doMock('nitropack/runtime', () => ({ defineNitroPlugin: (fn: unknown) => fn }))
})

describe('request-id plugin', () => {
  it('generates an id when none is sent', async () => {
    const hook = await loadPlugin('../../server/plugins/request-id')
    const { event, getHeader } = makeEvent()
    hook(event)
    expect(event.context.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(getHeader('x-request-id')).toBe(event.context.requestId)
  })

  it('keeps a safe incoming id and replaces unsafe ones', async () => {
    const hook = await loadPlugin('../../server/plugins/request-id')
    const ok = makeEvent({ headers: { 'x-request-id': 'abc-123' } })
    hook(ok.event)
    expect(ok.event.context.requestId).toBe('abc-123')

    const bad = makeEvent({ headers: { 'x-request-id': 'evil {"level":"error"}' } })
    hook(bad.event)
    expect(bad.event.context.requestId).not.toContain('evil')
  })
})

describe('security-headers plugin', () => {
  it('sets baseline security headers', async () => {
    const hook = await loadPlugin('../../server/plugins/security-headers')
    const { event, getHeader } = makeEvent()
    hook(event)
    expect(getHeader('x-content-type-options')).toBe('nosniff')
    expect(getHeader('x-frame-options')).toBe('DENY')
    expect(getHeader('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(getHeader('permissions-policy')).toContain('camera=()')
  })

  it('in production: HSTS without preload, strict CSP on API, hashed CSP on pages', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      vi.resetModules()
      vi.doMock('nitropack/runtime', () => ({ defineNitroPlugin: (fn: unknown) => fn }))
      const hooks = await loadHooks('../../server/plugins/security-headers')
      const api = makeEvent({ url: '/api/tickets' })
      hooks.request!(api.event as never)
      expect(api.getHeader('strict-transport-security')).toBe('max-age=31536000')
      expect(api.getHeader('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")

      const asset = makeEvent({ url: '/sw.js' })
      hooks.request!(asset.event as never)
      expect(asset.getHeader('content-security-policy')).toBeUndefined()

      const page = makeEvent({ url: '/staff' })
      hooks['render:response']!({ body: '<script>a()</script>' } as never, { event: page.event } as never)
      expect(page.getHeader('content-security-policy')).toContain("script-src 'self' 'sha256-")
    }
    finally {
      process.env.NODE_ENV = prev
    }
  })
})

describe('sweep-trigger plugin', () => {
  it('asks the database at most once per check window and never blocks the request', async () => {
    vi.resetModules()
    vi.doMock('nitropack/runtime', () => ({ defineNitroPlugin: (fn: unknown) => fn }))
    const sweepIfDue = vi.fn(async () => null)
    vi.doMock('../../server/lib/sweep', () => ({ sweepIfDue }))
    vi.doMock('../../server/db/client', () => ({ getDb: () => ({}) }))
    delete (globalThis as { __posSweepCheckAt?: number }).__posSweepCheckAt
    try {
      const hook = await loadPlugin('../../server/plugins/sweep-trigger')
      const waits: Promise<unknown>[] = []
      const fire = (url: string) => {
        const { event } = makeEvent({ url })
        Object.assign(event, { path: url, waitUntil: (p: Promise<unknown>) => waits.push(p) })
        hook(event)
      }
      fire('/staff')
      fire('/api/tickets')
      fire('/api/tickets')
      await Promise.all(waits)
      expect(waits).toHaveLength(1)
      expect(sweepIfDue).toHaveBeenCalledTimes(1)
    }
    finally {
      vi.doUnmock('../../server/lib/sweep')
      vi.doUnmock('../../server/db/client')
      delete (globalThis as { __posSweepCheckAt?: number }).__posSweepCheckAt
    }
  })
})
