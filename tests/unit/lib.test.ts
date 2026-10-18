import { describe, expect, it } from 'vitest'
import type { ZodError} from 'zod';
import { z } from 'zod'
import { formatCents, fromCents, sumCents, toCents } from '../../server/lib/money'
import { requireRole } from '../../server/lib/rbac'
import { assertCsrf } from '../../server/lib/csrf'
import { AppError, isForeignKeyViolation, isUniqueViolation, sendAppError } from '../../server/lib/errors'
import { escapeCsv } from '../../server/lib/reports-csv'
import { makeEvent } from '../setup/h3-event'

describe('money', () => {
  it('converts and sums integer cents', () => {
    expect(toCents(3.5)).toBe(350)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(fromCents(450)).toBe(4.5)
    expect(sumCents([350, 400, 1])).toBe(751)
  })

  it('rejects non-integer cents and non-finite euros', () => {
    expect(() => toCents(Number.NaN)).toThrow(TypeError)
    expect(() => fromCents(1.5)).toThrow(TypeError)
    expect(() => sumCents([1, 2.5])).toThrow(TypeError)
    expect(() => formatCents(1.5, 'de')).toThrow(TypeError)
  })

  it('formats EUR per locale', () => {
    expect(formatCents(350, 'de')).toMatch(/3,50\s€/)
    expect(formatCents(350, 'en')).toMatch(/€3\.50/)
  })
})

describe('requireRole', () => {
  it('rejects anonymous requests with 401 and wrong roles with 403', () => {
    const { event } = makeEvent()
    expect(() => requireRole(event, ['admin'])).toThrow(expect.objectContaining({ status: 401 }))
    event.context.auth = { staff: { staffId: 's', role: 'kitchen', username: 'k' } }
    expect(() => requireRole(event, ['admin', 'waiter'])).toThrow(expect.objectContaining({ status: 403 }))
    expect(requireRole(event, ['kitchen']).staffId).toBe('s')
    expect(requireRole(event, []).role).toBe('kitchen')
  })
})

describe('assertCsrf', () => {
  const token = 'a'.repeat(64)

  it('ignores safe methods', () => {
    expect(() => assertCsrf(makeEvent({ method: 'GET' }).event)).not.toThrow()
  })

  it('requires a matching cookie and header on mutations', () => {
    expect(() => assertCsrf(makeEvent({ method: 'POST' }).event)).toThrow(/Missing CSRF/)
    expect(() => assertCsrf(makeEvent({
      method: 'POST', cookies: { csrf: token }, headers: { 'x-csrf-token': 'b'.repeat(64) },
    }).event)).toThrow(/Invalid CSRF/)
    expect(() => assertCsrf(makeEvent({
      method: 'POST', cookies: { csrf: token }, headers: { 'x-csrf-token': 'short' },
    }).event)).toThrow(/Invalid CSRF/)
    expect(() => assertCsrf(makeEvent({
      method: 'POST', cookies: { csrf: token }, headers: { 'x-csrf-token': token },
    }).event)).not.toThrow()
  })
})

describe('sendAppError', () => {
  const { event } = makeEvent()

  it('maps AppError to its status and code', () => {
    expect(() => sendAppError(event, new AppError('NOT_FOUND', 404, 'nope')))
      .toThrow(expect.objectContaining({ statusCode: 404, data: expect.objectContaining({ code: 'NOT_FOUND' }) }))
  })

  it('maps zod validation errors to 400 with issue paths', () => {
    let zodErr: ZodError | undefined
    try {
      z.object({ tableNo: z.number() }).parse({ tableNo: 'x' })
    }
    catch (e) {
      zodErr = e as ZodError
    }
    expect(() => sendAppError(event, zodErr)).toThrow(expect.objectContaining({
      statusCode: 400,
      data: expect.objectContaining({ code: 'VALIDATION', details: [expect.objectContaining({ path: 'tableNo' })] }),
    }))
  })

  it('maps connection exhaustion to 503 and anything else to 500', () => {
    expect(() => sendAppError(event, new Error('sorry, too many connections')))
      .toThrow(expect.objectContaining({ statusCode: 503 }))
    expect(() => sendAppError(event, new Error('boom'))).toThrow(expect.objectContaining({ statusCode: 500 }))
  })

  it('detects Postgres error codes through drizzle cause chains', () => {
    const wrapped = { message: 'Failed query', cause: { code: '23505' } }
    expect(isUniqueViolation(wrapped)).toBe(true)
    expect(isForeignKeyViolation(wrapped)).toBe(false)
    expect(isForeignKeyViolation({ code: '23503' })).toBe(true)
    expect(isUniqueViolation(new Error('x'))).toBe(false)
  })
})

describe('escapeCsv', () => {
  it('quotes separators and neutralises spreadsheet formulas', () => {
    expect(escapeCsv(null)).toBe('')
    expect(escapeCsv(350)).toBe('350')
    expect(escapeCsv(-5)).toBe('-5')
    expect(escapeCsv('Beer; large')).toBe('"Beer; large"')
    expect(escapeCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(escapeCsv('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(escapeCsv('+49 123')).toBe(`'+49 123`)
  })
})

describe('pageCsp', () => {
  it('hashes executable inline scripts only', async () => {
    const { createHash } = await import('node:crypto')
    const { inlineScriptHashes, pageCsp } = await import('../../server/lib/csp')
    const html = [
      '<script>window.__NUXT__={}</script>',
      '<script type="importmap">{"imports":{}}</script>',
      '<script type="application/json" id="__NUXT_DATA__">[1]</script>',
      '<script type="module" src="/_nuxt/x.js"></script>',
      '<script>window.__NUXT__={}</script>',
    ].join('')
    const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`
    expect(inlineScriptHashes(html)).toEqual([sha('window.__NUXT__={}'), sha('{"imports":{}}')])
    const csp = pageCsp(html)
    expect(csp).toContain(`script-src 'self' ${sha('window.__NUXT__={}')}`)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  })
})
