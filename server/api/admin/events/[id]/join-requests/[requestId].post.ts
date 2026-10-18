import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { getDb } from '../../../../../db/client'
import { AppError, sendAppError } from '../../../../../lib/errors'
import { assertCsrf } from '../../../../../lib/csrf'
import { requireRole } from '../../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../../lib/events'
import { JoinDecisionSchema } from '../../../../../lib/contracts/join'
import { decideJoin } from '../../../../../lib/staff-join'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "Freigeben" (with a role, default Bedienung) or "Ablehnen".
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const requestId = getRouterParam(event, 'requestId') ?? ''
    if (!UUID_RE.test(requestId)) throw new AppError('VALIDATION', 400, 'Invalid request id')
    const input = JoinDecisionSchema.parse(await readBody(event))
    const db = getDb()
    const ev = await loadEvent(db, eventIdParam(event))
    await decideJoin(db, ev, requestId, input, admin.staffId)
    return { ok: true as const }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
