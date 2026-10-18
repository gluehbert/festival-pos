import { serverEnv } from './env'

// Returns human-readable problems with the server configuration. Used by the
// startup plugin (log) and /api/healthz (fail the health check).
export function configProblems(): string[] {
  const config = serverEnv()
  const problems: string[] = []
  if (!config.databaseUrl) problems.push('DATABASE_URL is not set')
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET is missing or shorter than 32 characters')
  }
  return problems
}
