import type { ReportType } from './contracts/reports'

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Free text (e.g. void reasons) must not be interpreted as a spreadsheet
  // formula when the export is opened in Excel/LibreOffice.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`
  }
  if (/[;\n\r"]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// CSV columns per report, in export order; each column is a row field.
// A few get a clearer header or a spreadsheet-friendly value (see CSV_COLUMN).
const COLUMNS: Record<ReportType, string[]> = {
  revenue_by_category: ['category', 'totalCents', 'itemCount'],
  top_items: ['menuItemId', 'nameDe', 'nameEn', 'quantity', 'totalCents'],
  voids: ['orderItemId', 'nameDe', 'nameEn', 'tableNo', 'reason', 'voidedAt', 'voidedByStaffId', 'refundedCents'],
  payments_by_staff: ['staffId', 'username', 'paymentCount', 'totalCents', 'refundedCents', 'tipCents'],
  tips: ['staffId', 'username', 'paymentCount', 'tipCents'],
  orders_per_hour: ['hour', 'orderCount', 'guestOrderCount'],
  staff_meals: ['menuItemId', 'nameDe', 'nameEn', 'quantity', 'valueCents'],
  table_assignments: ['tableNo', 'username', 'staffId', 'assignedAt'],
  price_rules: ['ruleId', 'ruleName', 'menuItemId', 'nameDe', 'nameEn', 'quantity', 'totalCents', 'discountCents'],
  app_usage: ['tableNo', 'scans', 'orderingDevices', 'guestOrders', 'staffOrders', 'guestItems', 'staffItems'],
  deposits: ['unitCents', 'issuedQuantity', 'issuedCents', 'returnedQuantity', 'returnedCents', 'balanceCents'],
  cash_sessions: [
    'id', 'username', 'openedAt', 'closedAt', 'openingCents', 'collectedCents', 'tipCents', 'refundedCents',
    'depositReturnedCents', 'expectedCents', 'countedCents', 'differenceCents', 'note',
  ],
}

const CSV_COLUMN: Record<string, { header: string; format: (v: unknown) => unknown }> = {
  // Local Berlin hour, "2026-07-04 18:00" (spreadsheets read it as a date).
  hour: { header: 'hourEuropeBerlin', format: (v) => String(v).replace('T', ' ') },
}

export function reportToCsv(
  type: ReportType,
  rows: Array<Record<string, unknown>>,
): string {
  const fields = COLUMNS[type]
  const lines = [fields.map((f) => escapeCsv(CSV_COLUMN[f]?.header ?? f)).join(';')]
  for (const row of rows) {
    lines.push(fields.map((f) => escapeCsv(CSV_COLUMN[f] ? CSV_COLUMN[f].format(row[f]) : row[f])).join(';'))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
