import { defineEventHandler } from 'h3'
import { getDb } from '../../../../../db/client'
import { sendAppError } from '../../../../../lib/errors'
import { requireRole } from '../../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../../lib/events'
import { PriceRulesListSchema } from '../../../../../lib/contracts/pricing'
import { loadPriceRulesList } from '../../../../../lib/price-rules'

// Rules of the event plus the "gerade aktiv" preview: articles cheaper right now.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    return PriceRulesListSchema.parse(await loadPriceRulesList(db, ev.id))
  }
  catch (err) {
    sendAppError(event, err)
  }
})
