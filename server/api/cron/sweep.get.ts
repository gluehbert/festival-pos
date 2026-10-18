import { defineEventHandler, getHeader } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { getDb } from '../../db/client'
import { AppError, sendAppError } from '../../lib/errors'
import { log } from '../../lib/log'
import { claimSweep, sweep } from '../../lib/sweep'

// Called by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export default defineEventHandler(async (event) => {
  try {
    const secret = process.env.CRON_SECRET
    const expected = Buffer.from(`Bearer ${secret ?? ''}`)
    const given = Buffer.from(getHeader(event, 'authorization') ?? '')
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new AppError('UNAUTHORIZED', 401, 'Invalid cron secret')
    }
    const db = getDb()
    // Always runs; recording it lets the traffic trigger skip the next hour.
    await claimSweep(db, 0)
    const result = await sweep(db)
    log.info('sweep.ok', { requestId: event.context.requestId as string | undefined, route: 'cron:sweep', ...result })
    return result
  }
  catch (err) {
    sendAppError(event, err)
  }
})
