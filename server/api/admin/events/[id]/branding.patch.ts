import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../db/client'
import { events } from '../../../../db/schema'
import { AppError, sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { loadBranding } from '../../../../lib/branding'
import { UpdateBrandingSchema } from '../../../../lib/contracts/branding'
import { datesInOrder } from '../../../../lib/contracts/admin'
import { writeAudit } from '../../../../lib/audit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid event id')
    const input = UpdateBrandingSchema.parse(await readBody(event))
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
    const db = getDb()
    if (input.startsOn !== undefined || input.endsOn !== undefined) {
      const current = await loadBranding(db, id)
      const dates = {
        startsOn: input.startsOn === undefined ? current.startsOn : input.startsOn,
        endsOn: input.endsOn === undefined ? current.endsOn : input.endsOn,
      }
      if (!datesInOrder(dates)) throw new AppError('VALIDATION', 400, 'Das Enddatum liegt vor dem Startdatum')
    }
    if (Object.keys(patch).length > 0) {
      await db.transaction(async (tx) => {
        const updated = await tx.update(events).set(patch).where(eq(events.id, id)).returning({ id: events.id })
        if (updated.length === 0) throw new AppError('NOT_FOUND', 404, 'Event not found')
        // Long texts (programme, legal pages) only by field name.
        const short = ['name', 'accentColor', 'startsOn', 'endsOn', 'depositEnabled', 'staffMealsEnabled', 'waiterCallsEnabled', 'guestOpenLimitBarCents', 'guestOpenLimitKitchenCents'] as const
        await writeAudit(tx, {
          action: 'event_update',
          staffId: admin.staffId,
          targetKind: 'event',
          targetId: id,
          payload: { fields: Object.keys(patch), ...Object.fromEntries(short.filter((k) => k in patch).map((k) => [k, patch[k]])) },
        })
      })
    }
    return await loadBranding(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
