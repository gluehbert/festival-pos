// What the server put into an AppError (server/lib/errors.ts) of a failed
// API call. Nitro answers with { statusCode, statusMessage, message, data },
// $fetch puts that body on the error's `data`, so the AppError payload sits
// at `data.data`. Empty when the call never got an answer from the app.
export interface ApiErrorPayload<D> {
  code?: string
  message?: string
  details?: D
}

export function apiError<D = Record<string, unknown>>(e: unknown): ApiErrorPayload<D> {
  return (e as { data?: { data?: ApiErrorPayload<D> } } | null | undefined)?.data?.data ?? {}
}
