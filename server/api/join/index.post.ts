import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { getDb } from '../../db/client'
import { sendAppError } from '../../lib/errors'
import { assertCsrf } from '../../lib/csrf'
import { setJoinCookie } from '../../lib/auth'
import { JoinRequestSchema, JoinStatusSchema } from '../../lib/contracts/join'
import { eventForJoinCode, hashJoinToken, newJoinToken, requestToJoin } from '../../lib/staff-join'

// A helper opened the event's join link and typed their name: into the
// waiting room. The device keeps the token (cookie) and polls /api/join/status.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const input = JoinRequestSchema.parse(await readBody(event))
    const db = getDb()
    const ev = await eventForJoinCode(db, input.code)
    const token = newJoinToken()
    await requestToJoin(db, ev, input.name, hashJoinToken(token))
    setJoinCookie(event, token)
    setResponseStatus(event, 201)
    return JoinStatusSchema.parse({ status: 'pending', name: input.name })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
