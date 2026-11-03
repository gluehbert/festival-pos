// A failed $fetch call shaped like the real answer of the server: an AppError
// (server/lib/errors.ts) arrives as Nitro's error body, which $fetch puts on
// the error's `data`; the AppError payload sits one level deeper, in
// `data.data`. tests/e2e/api-errors.spec.ts checks this shape against the
// built server. Never mock the payload flat on `data`.
export function apiFailure(statusCode: number, code: string, opts: { message?: string; details?: unknown } = {}) {
  const message = opts.message ?? code
  const payload = { code, message, ...(opts.details !== undefined ? { details: opts.details } : {}) }
  return Object.assign(new Error(`[${statusCode}] ${message}`), {
    statusCode,
    status: statusCode,
    data: { error: true, statusCode, statusMessage: message, message, data: payload },
  })
}
