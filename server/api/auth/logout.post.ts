import { defineEventHandler } from 'h3'
import { sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { clearStaffCookie } from '../../lib/auth'
import { OkSchema } from '../../lib/contracts/staff'

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    clearStaffCookie(event)
    return OkSchema.parse({ ok: true })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
