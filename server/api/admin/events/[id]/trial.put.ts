import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { and, count, eq } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { auditLog, events, orders } from '../../../../db/schema'
import { AppError, sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { TrialModeSchema } from '../../../../lib/contracts/admin'
import { loadEventDto, resetTableState } from '../../../../lib/events'
import { markSetup } from '../../../../lib/event-setup'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Switches rehearsal mode. Existing test data is kept; ending the rehearsal also resets table
// assignments and checks; it is removed with
// DELETE /api/admin/events/:id/trial-data.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID.test(id)) throw new AppError('VALIDATION', 400, 'Invalid event id')
    const { enabled } = TrialModeSchema.parse(await readBody(event))

    const db = getDb()
    await db.transaction(async (tx) => {
      const before = (await tx.select({ trialMode: events.trialMode }).from(events).where(eq(events.id, id)).limit(1))[0]
      if (!before) throw new AppError('NOT_FOUND', 404, 'Event not found')
      await tx.update(events).set({ trialMode: enabled }).where(eq(events.id, id))
      // Only the real switch off resets the floor; a repeated "off" must not touch a live event.
      if (before.trialMode && !enabled) {
        await resetTableState(tx, id)
        // A rehearsal with at least one test order ticks off "Probelauf" in the setup.
        const [held] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.eventId, id), eq(orders.isTrial, true)))
        if (Number(held?.n ?? 0) > 0) await markSetup(tx, id, { trialHeldAt: new Date() })
      }
      await tx.insert(auditLog).values({
        action: 'event_trial',
        staffId: staff.staffId,
        targetKind: 'event',
        targetId: id,
        payload: { trialMode: enabled },
      })
    })
    return await loadEventDto(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
