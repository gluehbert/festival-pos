import { defineEventHandler } from 'h3'
import { getDb } from '../../db/client'
import { AppError, sendAppError } from '../../lib/errors'
import { assertLiveGuestSession } from '../../lib/guest-session'

// An ended session answers 401, so the guest page opens a new one with the
// key of a freshly scanned QR code.
export default defineEventHandler(async (event) => {
  try {
    const guest = event.context.guest
    if (!guest) {
      throw new AppError('UNAUTHORIZED', 401, 'No guest session')
    }
    await assertLiveGuestSession(getDb(), guest)
    return {
      sessionId: guest.sessionId,
      eventId: guest.eventId,
      tableNo: guest.tableNo,
    }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
