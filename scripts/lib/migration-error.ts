// What a failed migration prints. drizzle-kit only showed a spinner and the
// exit code, so a broken build said nothing about why. Postgres puts the
// reason in the error's cause (or the error itself), the failed statement in
// the message.
export function migrationError(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string; detail?: string; code?: string } }
  const pgError = e?.cause ?? (e as typeof e.cause)
  const lines = [`migrate: failed: ${pgError?.message ?? String(err)}`]
  if (pgError?.code) lines.push(`  code: ${pgError.code}`)
  if (pgError?.detail) lines.push(`  detail: ${pgError.detail}`)
  if (e?.cause && e.message) lines.push(`  ${e.message.split('\n')[0]}`)
  return lines.join('\n')
}
