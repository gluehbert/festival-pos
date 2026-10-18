import { defineEventHandler } from 'h3'
import { AppError, sendAppError } from '../../lib/errors'

export default defineEventHandler((event) => {
  try {
    const guest = event.context.guest
    if (!guest) {
      throw new AppError('UNAUTHORIZED', 401, 'No guest session')
    }
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
