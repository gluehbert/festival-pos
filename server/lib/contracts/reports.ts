import { z } from 'zod'
import { CashSessionSchema } from './cash'
import { DepositReportRowSchema } from './deposit'
import { TableAssignmentSchema } from './tables'
import { PriceRuleReportRowSchema } from './pricing'

export const ReportTypeEnum = z.enum([
  'revenue_by_category',
  'top_items',
  'voids',
  'payments_by_staff',
  'tips',
  'orders_per_hour',
  'cash_sessions',
  'deposits',
  'staff_meals',
  'table_assignments',
  'price_rules',
  'app_usage',
])
export type ReportType = z.infer<typeof ReportTypeEnum>

export const ReportFormatEnum = z.enum(['json', 'csv'])
export type ReportFormat = z.infer<typeof ReportFormatEnum>

export const ReportQuerySchema = z.object({
  type: ReportTypeEnum,
  format: ReportFormatEnum.default('json'),
})
export type ReportQuery = z.infer<typeof ReportQuerySchema>

export const RevenueByCategoryRowSchema = z.object({
  category: z.string(),
  totalCents: z.number().int(),
  itemCount: z.number().int(),
})
export type RevenueByCategoryRow = z.infer<typeof RevenueByCategoryRowSchema>

export const TopItemRowSchema = z.object({
  menuItemId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  quantity: z.number().int(),
  totalCents: z.number().int(),
})
export type TopItemRow = z.infer<typeof TopItemRowSchema>

export const VoidRowSchema = z.object({
  orderItemId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  reason: z.string(),
  voidedAt: z.string().datetime(),
  voidedByStaffId: z.string().uuid().nullable(),
  // > 0 when the item had been paid and the money was handed back.
  refundedCents: z.number().int().nonnegative(),
})
export type VoidRow = z.infer<typeof VoidRowSchema>

export const PaymentsByStaffRowSchema = z.object({
  staffId: z.string().uuid(),
  username: z.string(),
  paymentCount: z.number().int(),
  // Net cash: payments collected minus refunds paid out by this person.
  totalCents: z.number().int(),
  refundedCents: z.number().int().nonnegative(),
  tipCents: z.number().int().nonnegative(),
})
export type PaymentsByStaffRow = z.infer<typeof PaymentsByStaffRowSchema>

// Tips per waiter (only payments that carry one) and, last, the total row
// (staffId and username null).
export const TipRowSchema = z.object({
  staffId: z.string().uuid().nullable(),
  username: z.string().nullable(),
  paymentCount: z.number().int(),
  tipCents: z.number().int().nonnegative(),
})
export type TipRow = z.infer<typeof TipRowSchema>

// Helferverpflegung: booked at 0 €, valued at the menu price.
export const StaffMealReportRowSchema = z.object({
  menuItemId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  quantity: z.number().int(),
  valueCents: z.number().int(),
})
export type StaffMealReportRow = z.infer<typeof StaffMealReportRowSchema>

export const OrdersPerHourRowSchema = z.object({
  // Local wall-clock hour in Europe/Berlin, no offset: "2026-07-04T18:00".
  hour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/),
  orderCount: z.number().int(),
  // Of those, placed by guests themselves (QR code).
  guestOrderCount: z.number().int(),
})
export type OrdersPerHourRow = z.infer<typeof OrdersPerHourRowSchema>

// App usage per table over the whole event. Guest = ordered on their own
// phone, staff = taken by a waiter at the table (walk-ins are not counted).
export const AppUsageRowSchema = z.object({
  tableNo: z.number().int(),
  // Phones signed in at this table (QR code or event PIN).
  scans: z.number().int(),
  // Phones that placed at least one order.
  orderingDevices: z.number().int(),
  guestOrders: z.number().int(),
  staffOrders: z.number().int(),
  guestItems: z.number().int(),
  staffItems: z.number().int(),
})
export type AppUsageRow = z.infer<typeof AppUsageRowSchema>

const envelope = <R extends z.ZodTypeAny>(type: ReportType, row: R) =>
  z.object({
    eventId: z.string().uuid(),
    generatedAt: z.string().datetime(),
    type: z.literal(type),
    rows: z.array(row),
  })

export const RevenueByCategoryReportSchema = envelope(
  'revenue_by_category',
  RevenueByCategoryRowSchema,
)
export const TopItemsReportSchema = envelope('top_items', TopItemRowSchema)
export const VoidsReportSchema = envelope('voids', VoidRowSchema)
export const PaymentsByStaffReportSchema = envelope(
  'payments_by_staff',
  PaymentsByStaffRowSchema,
)
export const TipsReportSchema = envelope('tips', TipRowSchema)
export const OrdersPerHourReportSchema = envelope(
  'orders_per_hour',
  OrdersPerHourRowSchema,
)

export const CashSessionsReportSchema = envelope('cash_sessions', CashSessionSchema)
export const DepositsReportSchema = envelope('deposits', DepositReportRowSchema)
export const StaffMealsReportSchema = envelope('staff_meals', StaffMealReportRowSchema)
// Who currently holds which table ("Meine Tische").
export const TableAssignmentsReportSchema = envelope('table_assignments', TableAssignmentSchema)
export const PriceRulesReportSchema = envelope('price_rules', PriceRuleReportRowSchema)
export const AppUsageReportSchema = envelope('app_usage', AppUsageRowSchema)

export const ReportSchema = z.discriminatedUnion('type', [
  RevenueByCategoryReportSchema,
  TopItemsReportSchema,
  VoidsReportSchema,
  PaymentsByStaffReportSchema,
  TipsReportSchema,
  OrdersPerHourReportSchema,
  CashSessionsReportSchema,
  DepositsReportSchema,
  StaffMealsReportSchema,
  TableAssignmentsReportSchema,
  PriceRulesReportSchema,
  AppUsageReportSchema,
])
export type Report = z.infer<typeof ReportSchema>

// All report types in one response, read from one snapshot.
export const ReportsAllSchema = z.object({
  eventId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  reports: z.object({
    revenue_by_category: z.array(RevenueByCategoryRowSchema),
    top_items: z.array(TopItemRowSchema),
    voids: z.array(VoidRowSchema),
    payments_by_staff: z.array(PaymentsByStaffRowSchema),
    tips: z.array(TipRowSchema),
    orders_per_hour: z.array(OrdersPerHourRowSchema),
    cash_sessions: z.array(CashSessionSchema),
    deposits: z.array(DepositReportRowSchema),
    staff_meals: z.array(StaffMealReportRowSchema),
    table_assignments: z.array(TableAssignmentSchema),
    price_rules: z.array(PriceRuleReportRowSchema),
    app_usage: z.array(AppUsageRowSchema),
  }),
})
export type ReportsAll = z.infer<typeof ReportsAllSchema>
