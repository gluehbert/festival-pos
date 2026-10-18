import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../../db/client'
import { AppError, sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { loadBranding } from '../../../../lib/branding'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid event id')
    return await loadBranding(getDb(), id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
