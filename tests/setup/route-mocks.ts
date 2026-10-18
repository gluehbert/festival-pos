import { vi } from 'vitest'
import type { IMemoryDb } from 'pg-mem'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '../../server/db/schema'

export interface RouteTestCtx {
  mem: IMemoryDb
  db: NodePgDatabase<typeof schema>
  body: unknown
  guest?: { sessionId: string; eventId: string; tableNo: number }
  setBody: (b: unknown) => void
  setGuest: (g: RouteTestCtx['guest']) => void
}

let current: RouteTestCtx | null = null

export function setCtx(ctx: RouteTestCtx): void {
  current = ctx
}

export function getCtx(): RouteTestCtx {
  if (!current) throw new Error('route test ctx not set')
  return current
}

// Tests may change values (e.g. public.appUrl) and must reset them.
export const runtimeConfig = {
  jwtSecret: 'x'.repeat(32),
  cookieDomain: 'localhost',
  databaseUrl: '',
  public: { appUrl: '' },
}

export async function installCommonMocks(): Promise<void> {
  vi.doMock('#imports', () => ({ useRuntimeConfig: () => runtimeConfig }))
  vi.doMock('../../server/db/client', () => ({
    getDb: () => getCtx().db,
  }))
  vi.doMock('h3', async () => {
    const actual = await vi.importActual<typeof import('h3')>('h3')
    return {
      ...actual,
      readBody: async () => getCtx().body,
      // Tests pass multipart parts as an array body.
      readMultipartFormData: async () => (Array.isArray(getCtx().body) ? getCtx().body : undefined),
    }
  })
}

export async function makeCtx(): Promise<RouteTestCtx> {
  const { buildPgMem } = await import('./pg-mem-db')
  const { mem, db } = buildPgMem()
  const ctx: RouteTestCtx = {
    mem,
    db,
    body: undefined,
    setBody(b) {
      ctx.body = b
    },
    setGuest(g) {
      ctx.guest = g
    },
  }
  return ctx
}
