import { defineEventHandler, getRouterParam } from 'h3'
import { getDb } from '../../../../../db/client'
import { AppError, sendAppError } from '../../../../../lib/errors'
import { requireRole } from '../../../../../lib/rbac'
import { PasskeyListSchema } from '../../../../../lib/contracts/passkeys'
import { UUID_RE, listPasskeys } from '../../../../../lib/passkeys'

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid staff id')
    return PasskeyListSchema.parse({ passkeys: await listPasskeys(getDb(), id) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
