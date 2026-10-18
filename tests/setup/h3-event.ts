import type { H3Event } from 'h3'

export function makeEvent(opts: {
  method?: string
  cookies?: Record<string, string>
  headers?: Record<string, string>
  url?: string
} = {}): { event: H3Event; getSetCookies: () => string[]; getHeader: (name: string) => string | string[] | undefined } {
  const setCookies: string[] = []
  const resHeaders = new Map<string, string | string[]>()
  const reqHeaders: Record<string, string> = { ...(opts.headers ?? {}) }
  if (opts.cookies && Object.keys(opts.cookies).length > 0) {
    reqHeaders.cookie = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  }
  const url = opts.url ?? '/'
  const event = {
    node: {
      req: {
        headers: reqHeaders,
        method: opts.method ?? 'GET',
        url,
        socket: { remoteAddress: '127.0.0.1' },
      },
      res: {
        statusCode: 200,
        getHeader(name: string) {
          if (name.toLowerCase() === 'set-cookie') return setCookies
          return resHeaders.get(name.toLowerCase())
        },
        setHeader(name: string, value: string | string[]) {
          const key = name.toLowerCase()
          if (key === 'set-cookie') {
            setCookies.length = 0
            if (Array.isArray(value)) setCookies.push(...value)
            else setCookies.push(value)
            return
          }
          resHeaders.set(key, value)
        },
        appendHeader(name: string, value: string | string[]) {
          const key = name.toLowerCase()
          if (key === 'set-cookie') {
            if (Array.isArray(value)) setCookies.push(...value)
            else setCookies.push(value)
            return
          }
          resHeaders.set(key, value)
        },
        removeHeader(name: string) {
          const key = name.toLowerCase()
          if (key === 'set-cookie') setCookies.length = 0
          else resHeaders.delete(key)
        },
      },
    },
    method: opts.method ?? 'GET',
    path: url,
    headers: new Headers(reqHeaders),
    context: {},
    web: { request: new Request(`http://localhost${url}`, { method: opts.method ?? 'GET' }) },
  } as unknown as H3Event
  return {
    event,
    getSetCookies: () => setCookies,
    getHeader: (name: string) => resHeaders.get(name.toLowerCase()),
  }
}
