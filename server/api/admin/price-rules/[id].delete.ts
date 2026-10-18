import { defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { auditLog } from '../../../db/schema'
import { priceRules } from '../../../db/schema-pricing'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole } from '../../../lib/rbac'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Booked order lines keep their price and the rule's name, so reports still
// show what was sold under a deleted rule.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid price rule id')
    const db = getDb()
    const current = (await db.select().from(priceRules).where(eq(priceRules.id, id)).limit(1))[0]
    if (!current) throw new AppError('NOT_FOUND', 404, 'Price rule not found')
    await db.transaction(async (tx) => {
      await tx.delete(priceRules).where(eq(priceRules.id, id))
      await tx.insert(auditLog).values({
        action: 'price_rule_delete',
        staffId: admin.staffId,
        targetKind: 'price_rule',
        targetId: id,
        payload: { eventId: current.eventId, name: current.name },
      })
    })
    return { id, deleted: true }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
