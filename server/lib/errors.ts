import process from 'node:process'
import { createError, setResponseHeader, type H3Event } from 'h3'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Drizzle wraps driver errors, so the Postgres SQLSTATE may sit on `cause`.
function hasPgCode(err: unknown, code: string): boolean {
  let e: unknown = err
  for (let depth = 0; e && depth < 3; depth++) {
    if ((e as { code?: unknown }).code === code) return true
    e = (e as { cause?: unknown }).cause
  }
  return false
}

export function isUniqueViolation(err: unknown): boolean {
  return hasPgCode(err, '23505')
}

export function isForeignKeyViolation(err: unknown): boolean {
  return hasPgCode(err, '23503')
}

// The code asks for a column or table the database does not have (or no
// longer has): app version and migrations are out of step, for example
// old code against a database a newer deploy already migrated.
export function isSchemaMismatch(err: unknown): boolean {
  return hasPgCode(err, '42703') || hasPgCode(err, '42P01')
}

function isDbConnectionLimit(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    message.includes('too many connections')
    || message.includes('connection limit')
    || message.includes('remaining connection slots')
  )
}

export function sendAppError(event: H3Event, err: unknown): never {
  const isProd = process.env.NODE_ENV === 'production'

  if (isDbConnectionLimit(err)) {
    setResponseHeader(event, 'Retry-After', 1)
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      data: {
        code: 'DB_BUSY',
        message: 'Database temporarily unavailable, please retry.',
        retryAfterSeconds: 1,
      },
    })
  }

  if (isSchemaMismatch(err)) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        code: 'SCHEMA_MISMATCH',
        message: 'Database schema does not match this app version',
      },
    })
  }

  if (err instanceof AppError) {
    throw createError({
      statusCode: err.status,
      statusMessage: err.message,
      data: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    })
  }

  if (err instanceof ZodError) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      data: {
        code: 'VALIDATION',
        message: 'Invalid request',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
  }

  const message = err instanceof Error ? err.message : 'Internal Server Error'
  throw createError({
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    data: {
      code: 'INTERNAL',
      message: isProd ? 'Internal Server Error' : message,
    },
  })
}
