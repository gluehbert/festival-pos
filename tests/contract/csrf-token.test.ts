import { describe, expect, it, vi } from 'vitest'
import { CsrfTokenSchema } from '../../server/lib/contracts/health'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ jwtSecret: 'x'.repeat(32), cookieDomain: 'localhost', databaseUrl: '' }),
}))

describe('CsrfTokenSchema', () => {
  it('requires csrfToken >= 32 chars', () => {
    expect(() => CsrfTokenSchema.parse({ csrfToken: 'short' })).toThrow()
    const ok = CsrfTokenSchema.parse({ csrfToken: 'a'.repeat(64) })
    expect(ok.csrfToken.length).toBe(64)
  })

  it('issueCsrfToken sets a csrf cookie and returns a token', async () => {
    const { issueCsrfToken } = await import('../../server/lib/csrf')
    const headers: string[] = []
    const event = {
      node: {
        req: { headers: {}, method: 'GET' },
        res: {
          getHeader: (n: string) => (n.toLowerCase() === 'set-cookie' ? headers : undefined),
          setHeader: (n: string, v: string | string[]) => {
            if (n.toLowerCase() === 'set-cookie') {
              headers.length = 0
              if (Array.isArray(v)) headers.push(...v)
              else headers.push(v)
            }
          },
        },
      },
      context: {},
    } as never

    const token = issueCsrfToken(event)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(headers.join('\n')).toMatch(/^csrf=/)
  })
})
