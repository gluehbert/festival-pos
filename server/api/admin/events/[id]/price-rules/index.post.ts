import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { getDb } from '../../../../../db/client'
import { auditLog } from '../../../../../db/schema'
import { priceRules } from '../../../../../db/schema-pricing'
import { sendAppError } from '../../../../../lib/errors'
import { assertCsrf } from '../../../../../lib/csrf'
import { requireRole } from '../../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../../lib/events'
import { PriceRuleSchema } from '../../../../../lib/contracts/pricing'
import { assertRuleTargets, ruleValues, toPriceRuleDto } from '../../../../../lib/price-rules'

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const values = ruleValues(await readBody(event))
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    await assertRuleTargets(db, ev.id, values.menuItemIds)

    const row = await db.transaction(async (tx) => {
      const inserted = (await tx.insert(priceRules).values({ ...values, eventId: ev.id }).returning())[0]!
      await tx.insert(auditLog).values({
        action: 'price_rule_create',
        staffId: admin.staffId,
        targetKind: 'price_rule',
        targetId: inserted.id,
        payload: { eventId: ev.id, ...values },
      })
      return inserted
    })
    setResponseStatus(event, 201)
    return PriceRuleSchema.parse(toPriceRuleDto(row, new Date()))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
