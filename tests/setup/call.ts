import { getCtx } from './route-mocks'

const CSRF = 'a'.repeat(64)

export type Role = 'admin' | 'lead' | 'waiter' | 'kitchen' | 'bar'

export interface CallOptions {
  method?: string
  body?: unknown
  staff?: { staffId: string; role: Role; username?: string }
  guest?: { sessionId: string; eventId: string; tableNo: number }
  params?: Record<string, string>
  url?: string
  key?: string
}

// Calls a route handler like Nitro would (CSRF cookie + header included) and
// returns status and body; thrown AppErrors come back as their status.
export async function call<T = unknown>(
  handlerPath: string,
  opts: CallOptions = {},
): Promise<{ status: number; body: T; error?: { code?: string; message?: string; details?: unknown } }> {
  const { makeEvent } = await import('./h3-event')
  const handler = (await import(/* @vite-ignore */ handlerPath)).default as (e: unknown) => Promise<unknown>
  getCtx().setBody(opts.body)
  const headers: Record<string, string> = { 'x-csrf-token': CSRF }
  if (opts.key) headers['idempotency-key'] = opts.key
  const { event } = makeEvent({ method: opts.method ?? 'GET', cookies: { csrf: CSRF }, headers, url: opts.url })
  const context = event.context as Record<string, unknown>
  if (opts.staff) context.auth = { staff: { username: 'u', ...opts.staff } }
  if (opts.guest) context.guest = opts.guest
  if (opts.params) context.params = opts.params
  try {
    const body = await handler(event)
    return { status: event.node.res.statusCode, body: body as T }
  }
  catch (err) {
    const e = err as { statusCode?: number; data?: { code?: string; message?: string; details?: unknown } }
    return { status: e.statusCode ?? 500, body: null as T, error: e.data }
  }
}

export function insertStaff(role: Role, username = `${role}-${Math.random().toString(36).slice(2, 8)}`): string {
  return (getCtx().mem.public.one(
    `INSERT INTO staff (username, pin_hash, password_hash, role) VALUES ('${username}', 'h', 'h', '${role}') RETURNING id`,
  ) as { id: string }).id
}

export function insertGuest(eventId: string, tableNo: number): { sessionId: string; eventId: string; tableNo: number } {
  const sessionId = (getCtx().mem.public.one(
    `INSERT INTO guest_sessions (event_id, table_no, expires_at)
     VALUES ('${eventId}', ${tableNo}, now() + interval '7 days') RETURNING id`,
  ) as { id: string }).id
  return { sessionId, eventId, tableNo }
}
