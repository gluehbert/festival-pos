import type { Db } from '../db/client'
import type { ReportType } from './contracts/reports'
import {
  loadOrdersPerHour,
  loadPaymentsByStaff,
  loadRevenueByCategory,
  loadTopItems,
  loadVoids,
} from './reports'
import { loadCashSessions } from './cash-sessions'
import { loadDeposits, loadPriceRuleSales, loadStaffMeals, loadTips } from './reports-extra'
import { loadAssignments } from './table-assignments'
import { loadAppUsage } from './reports-usage'

export async function loadReportRows(
  db: Db,
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

