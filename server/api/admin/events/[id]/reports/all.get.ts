import { defineEventHandler, setResponseHeader } from 'h3'
import { getDb } from '../../../../../db/client'
import { sendAppError } from '../../../../../lib/errors'
import { requireRole } from '../../../../../lib/rbac'
import { ReportsAllSchema, ReportTypeEnum, type ReportType } from '../../../../../lib/contracts/reports'
import { loadReportRows } from '../../../../../lib/reports-load'
import { eventIdParam, loadEvent } from '../../../../../lib/events'

// Every report from one repeatable-read snapshot, so the tables agree.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const eventId = eventIdParam(event)

    const db = getDb()
    const { id } = await loadEvent(db, eventId)

    const reports = await db.transaction(async (tx) => {
      const out: Record<string, unknown[]> = {}
      for (const type of ReportTypeEnum.options as ReportType[]) {
        out[type] = await loadReportRows(tx as unknown as typeof db, type, id)
      }
      return out
    }, { isolationLevel: 'repeatable read' })

    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return ReportsAllSchema.parse({ eventId, generatedAt: new Date().toISOString(), reports })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
