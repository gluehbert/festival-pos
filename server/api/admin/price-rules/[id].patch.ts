import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { auditLog } from '../../../db/schema'
import { priceRules } from '../../../db/schema-pricing'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole } from '../../../lib/rbac'
import { PriceRulePatchSchema, PriceRuleSchema } from '../../../lib/contracts/pricing'
import { assertRuleTargets, ruleValues, toPriceRuleDto } from '../../../lib/price-rules'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Either { isActive } to switch a rule on or off, or the full rule.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid price rule id')
    const body = PriceRulePatchSchema.parse(await readBody(event))
    const values = 'startTime' in body ? ruleValues(body) : { isActive: body.isActive }

    const db = getDb()
    const current = (await db.select().from(priceRules).where(eq(priceRules.id, id)).limit(1))[0]
    if (!current) throw new AppError('NOT_FOUND', 404, 'Price rule not found')
    if ('menuItemIds' in values) await assertRuleTargets(db, current.eventId, values.menuItemIds)

    const row = await db.transaction(async (tx) => {
      const updated = (await tx.update(priceRules).set({ ...values, updatedAt: new Date() }).where(eq(priceRules.id, id)).returning())[0]!
      await tx.insert(auditLog).values({
        action: 'price_rule_update',
        staffId: admin.staffId,
        targetKind: 'price_rule',
        targetId: id,
        payload: { eventId: current.eventId, ...values },
      })
      return updated
    })
    return PriceRuleSchema.parse(toPriceRuleDto(row, new Date()))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
