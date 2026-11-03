import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import {
  ReportQuerySchema,
  ReportSchema,
} from '../../../../lib/contracts/reports'
import { loadReportRows } from '../../../../lib/reports-load'
import { reportToCsv } from '../../../../lib/reports-csv'
import { eventIdParam, loadEvent } from '../../../../lib/events'

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const eventId = eventIdParam(event)
    const query = ReportQuerySchema.parse(getQuery(event))

    const db = getDb()
    const { id } = await loadEvent(db, eventId)

    const rows = await loadReportRows(db, query.type, id)
    const generatedAt = new Date().toISOString()

    if (query.format === 'csv') {
      const csv = reportToCsv(query.type, rows)
      setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
      setResponseHeader(
        event,
        'Content-Disposition',
        `attachment; filename="${query.type}-${generatedAt.slice(0, 10)}.csv"`,
      )
      return csv
    }

    return ReportSchema.parse({
      eventId,
      generatedAt,
      type: query.type,
      rows,
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
