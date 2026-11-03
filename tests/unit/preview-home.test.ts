import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../setup/h3-event'
import handler from '../../server/middleware/preview-home'

afterEach(() => vi.unstubAllEnvs())

describe('preview-home middleware', () => {
  it('sends the bare start page to the staff login on previews', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { event, getHeader } = makeEvent({ url: '/' })
    const end = vi.fn()
    Object.assign(event.node.res, { end })
    await handler(event)
    expect(end).toHaveBeenCalled()
    expect(event.node.res.statusCode).toBe(302)
    expect(getHeader('location')).toBe('/staff/login')
  })

  it('keeps the guest landing with a table and everything outside previews', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const withTable = makeEvent({ url: '/?table=3' })
    await handler(withTable.event)
    expect(withTable.getHeader('location')).toBeUndefined()
    vi.stubEnv('VERCEL_ENV', 'production')
    const prod = makeEvent({ url: '/' })
    await handler(prod.event)
    expect(prod.getHeader('location')).toBeUndefined()
  })
})
