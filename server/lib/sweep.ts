import { and, eq, inArray, isNotNull, lt, lte, notInArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { eventAssets, events, guestSessions, maintenanceRuns, orders, paymentLocks } from '../db/schema'
import { loginAttempts } from '../db/schema-auth'
import { LOGIN_THROTTLE_WINDOW_MS } from './login-throttle'
import { deleteExpiredChallenges } from './passkeys'

// Flyers are only useful around the event; they are the largest stored files.
// Logos and texts stay as a template for the next event.
export const FLYER_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

// Traffic-triggered sweeps run at most this often across all instances.
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const SWEEP_JOB = 'sweep'

export interface SweepResult {
  expiredLocks: number
  expiredGuestSessions: number
  expiredFlyers: number
}

export async function sweep(db: Db): Promise<SweepResult> {
  const now = new Date()

  const locksDeleted = await db
    .delete(paymentLocks)
    .where(lt(paymentLocks.expiresAt, now))
    .returning({ id: paymentLocks.id })

  // Sessions that placed orders are kept: deleting them would null
  // orders.guest_session_id and violate orders_origin_chk. They are removed
  // together with their event (ON DELETE CASCADE).
  const sessionsDeleted = await db
    .delete(guestSessions)
    .where(
      and(
        lt(guestSessions.expiresAt, now),
        notInArray(
          guestSessions.id,
          db.select({ id: orders.guestSessionId }).from(orders).where(isNotNull(orders.guestSessionId)),
        ),
      ),
    )
    .returning({ id: guestSessions.id })

  await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, new Date(now.getTime() - LOGIN_THROTTLE_WINDOW_MS)))
  await deleteExpiredChallenges(db, now)

  // An event ends when another one is activated (deactivated_at; activating
  // clears it again). The created_at check keeps a flyer uploaded later.
  const flyerCutoff = new Date(now.getTime() - FLYER_RETENTION_DAYS * DAY_MS)
  const flyersDeleted = await db
    .delete(eventAssets)
    .where(
      and(
        eq(eventAssets.kind, 'flyer'),
        lt(eventAssets.createdAt, flyerCutoff),
        inArray(
          eventAssets.eventId,
          db.select({ id: events.id }).from(events).where(lt(events.deactivatedAt, flyerCutoff)),
        ),
      ),
    )
    .returning({ id: eventAssets.id })

  return {
    expiredLocks: locksDeleted.length,
    expiredGuestSessions: sessionsDeleted.length,
    expiredFlyers: flyersDeleted.length,
  }
}

// Takes the sweep slot if the last run is older than intervalMs. The UPDATE
// re-checks its WHERE after locking the row, so of several instances asking at
// once exactly one gets `true`. intervalMs = 0 always claims (cron) and only
// records the run.
export async function claimSweep(db: Db, intervalMs = SWEEP_INTERVAL_MS): Promise<boolean> {
  const now = new Date()
  await db
    .insert(maintenanceRuns)
    .values({ job: SWEEP_JOB, lastRunAt: new Date(0) })
    .onConflictDoNothing({ target: maintenanceRuns.job })
  const claimed = await db
    .update(maintenanceRuns)
    .set({ lastRunAt: now })
    .where(and(
      eq(maintenanceRuns.job, SWEEP_JOB),
      lte(maintenanceRuns.lastRunAt, new Date(now.getTime() - intervalMs)),
    ))
    .returning({ job: maintenanceRuns.job })
  return claimed.length > 0
}

// Sweeps unless another instance already did within intervalMs; null = skipped.
export async function sweepIfDue(db: Db, intervalMs = SWEEP_INTERVAL_MS): Promise<SweepResult | null> {
  if (!(await claimSweep(db, intervalMs))) return null
  return sweep(db)
}
