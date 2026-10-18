import { describe, expect, it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ jwtSecret: 'x'.repeat(32), cookieDomain: 'localhost', databaseUrl: '' }),
}))

describe('csrf', () => {
  it('POST without token throws 403', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { assertCsrf } = await import('../../server/lib/csrf')
    const { event } = makeEvent({ method: 'POST' })
    expect(() => assertCsrf(event)).toThrow(/CSRF/)
  })

  it('GET is exempt', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { assertCsrf } = await import('../../server/lib/csrf')
    const { event } = makeEvent({ method: 'GET' })
    expect(() => assertCsrf(event)).not.toThrow()
  })

  it('POST with matching cookie and header succeeds', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { assertCsrf } = await import('../../server/lib/csrf')
    const token = 'a'.repeat(64)
    const { event } = makeEvent({
      method: 'POST',
      cookies: { csrf: token },
      headers: { 'x-csrf-token': token },
    })
    expect(() => assertCsrf(event)).not.toThrow()
  })

  it('POST with mismatched header throws', async () => {
    const { makeEvent } = await import('../setup/h3-event')
    const { assertCsrf } = await import('../../server/lib/csrf')
    const { event } = makeEvent({
      method: 'POST',
      cookies: { csrf: 'a'.repeat(64) },
      headers: { 'x-csrf-token': 'b'.repeat(64) },
    })
    expect(() => assertCsrf(event)).toThrow(/CSRF/)
  })
})
