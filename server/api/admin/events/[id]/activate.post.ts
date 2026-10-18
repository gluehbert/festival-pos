import { defineEventHandler, getRouterParam } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { auditLog, events } from '../../../../db/schema'
import { AppError, sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { loadEventDto } from '../../../../lib/events'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const staff = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID.test(id)) {
      throw new AppError('VALIDATION', 400, 'Invalid event id')
    }

    const db = getDb()
    const target = await db.select().from(events).where(eq(events.id, id)).limit(1)
    if (!target[0]) {
      throw new AppError('NOT_FOUND', 404, 'Event not found')
    }

    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({ isActive: false, deactivatedAt: sql`now()` })
        .where(eq(events.isActive, true))
      await tx
        .update(events)
        .set({ isActive: true, activatedAt: sql`now()`, deactivatedAt: null })
        .where(eq(events.id, id))
      await tx.insert(auditLog).values({
        action: 'event_activate',
        staffId: staff.staffId,
        targetKind: 'event',
        targetId: id,
        payload: { eventId: id },
      })
    })

    return await loadEventDto(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
