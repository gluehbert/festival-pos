import { defineEventHandler } from 'h3'
import { sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { AppError, sendAppError } from '../lib/errors'
import { configProblems } from '../lib/config-check'
import { HealthSchema } from '../lib/contracts/health'

const TIMEOUT_MS = 1000

export default defineEventHandler(async (event) => {
  const started = Date.now()
  try {
    const problems = configProblems()
    if (problems.length > 0) {
      throw new AppError('MISCONFIGURED', 503, problems.join('; '))
    }
    const db = getDb()
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), TIMEOUT_MS)),
    ])
    const dbLatencyMs = Date.now() - started
    return HealthSchema.parse({ status: 'ok', dbLatencyMs })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
