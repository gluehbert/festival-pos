import { defineEventHandler, readBody } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { assertCsrf } from '../../../../lib/csrf'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { confirmSteps, loadSetup } from '../../../../lib/event-setup'
import { SetupConfirmSchema } from '../../../../lib/contracts/setup'

// "Weiter" in the guide bar: the step counts as done on every device.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    requireRole(event, ['admin'])
    const id = eventIdParam(event)
    const { steps } = SetupConfirmSchema.parse(await readBody(event))
    const db = getDb()
    await loadEvent(db, id)
    await confirmSteps(db, id, steps)
    return await loadSetup(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
