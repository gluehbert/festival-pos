import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import {
  ReportQuerySchema,
  ReportSchema,
  type ReportType,
} from '../../../../lib/contracts/reports'
import {
  loadOrdersPerHour,
  loadPaymentsByStaff,
  loadRevenueByCategory,
  loadTopItems,
  loadVoids,
} from '../../../../lib/reports'
import { reportToCsv } from '../../../../lib/reports-csv'
import { loadCashSessions } from '../../../../lib/cash-sessions'
import { loadDeposits, loadPriceRuleSales, loadStaffMeals, loadTips } from '../../../../lib/reports-extra'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { loadAssignments } from '../../../../lib/table-assignments'
import { loadAppUsage } from '../../../../lib/reports-usage'

async function loadRows(
  db: ReturnType<typeof getDb>,
  type: ReportType,
  eventId: string,
): Promise<Array<Record<string, unknown>>> {
  switch (type) {
    case 'revenue_by_category':
      return loadRevenueByCategory(db, eventId)
    case 'top_items':
      return loadTopItems(db, eventId)
    case 'voids':
      return loadVoids(db, eventId)
    case 'payments_by_staff':
      return loadPaymentsByStaff(db, eventId)
    case 'tips':
      return loadTips(db, eventId)
    case 'orders_per_hour':
      return loadOrdersPerHour(db, eventId)
    case 'cash_sessions':
      return loadCashSessions(db, eventId)
    case 'deposits':
      return loadDeposits(db, eventId)
    case 'staff_meals':
      return loadStaffMeals(db, eventId)
    case 'table_assignments':
      return loadAssignments(db, eventId)
    case 'price_rules':
      return loadPriceRuleSales(db, eventId)
    case 'app_usage':
      return loadAppUsage(db, eventId)
  }
}

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const eventId = eventIdParam(event)
    const query = ReportQuerySchema.parse(getQuery(event))

    const db = getDb()
    const { id } = await loadEvent(db, eventId)

    const rows = await loadRows(db, query.type, id)
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
