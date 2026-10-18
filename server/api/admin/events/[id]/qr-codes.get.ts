import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { getDb } from '../../../../db/client'
import { AppError, sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { QrRangeQuerySchema } from '../../../../lib/contracts/admin'
import { generateQrPdf } from '../../../../lib/pdf'
import { publicBaseUrl } from '../../../../lib/public-url'
import { eventIdParam, loadEvent } from '../../../../lib/events'

const MAX_TABLES_PER_PDF = 300

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const eventId = eventIdParam(event)
    const query = QrRangeQuerySchema.parse(getQuery(event))

    const db = getDb()
    const ev = await loadEvent(db, eventId)
    if (query.to - query.from + 1 > MAX_TABLES_PER_PDF) {
      throw new AppError('VALIDATION', 400, `At most ${MAX_TABLES_PER_PDF} tables per PDF`)
    }
    if (query.from < ev.tableRangeFrom || query.to > ev.tableRangeTo) {
      throw new AppError(
        'VALIDATION',
        400,
        `Range ${query.from}-${query.to} outside event range ${ev.tableRangeFrom}-${ev.tableRangeTo}`,
      )
    }

    const bytes = await generateQrPdf({
      event: { id: ev.id, name: ev.name },
      from: query.from,
      to: query.to,
      appUrl: publicBaseUrl(event),
    })

    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(
      event,
      'Content-Disposition',
      `attachment; filename="qr-codes-${query.from}-${query.to}.pdf"`,
    )
    return Buffer.from(bytes)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
