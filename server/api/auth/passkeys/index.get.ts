import { defineEventHandler } from 'h3'
import { getDb } from '../../../db/client'
import { sendAppError } from '../../../lib/errors'
import { requireStaff } from '../../../lib/rbac'
import { PasskeyListSchema } from '../../../lib/contracts/passkeys'
import { listPasskeys } from '../../../lib/passkeys'

// The signed-in staff member's own passkeys.
export default defineEventHandler(async (event) => {
  try {
    const me = requireStaff(event)
    return PasskeyListSchema.parse({ passkeys: await listPasskeys(getDb(), me.staffId) })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
