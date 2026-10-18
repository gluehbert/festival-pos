import { z } from 'zod'
import { AssigneeSchema, TableAssignmentSchema } from './tables'

export const StaffRoleEnum = z.enum(['admin', 'lead', 'waiter', 'kitchen', 'bar'])
export type StaffRoleDto = z.infer<typeof StaffRoleEnum>

export const StaffLoginSchema = z.object({
  username: z.string().min(1),
  secret: z.string().min(4),
  kind: z.enum(['password', 'pin']),
})
export type StaffLogin = z.infer<typeof StaffLoginSchema>

// Colour scheme per staff account: follow the OS, or always light / dark.
export const ThemeEnum = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof ThemeEnum>

export const ThemeSchema = z.object({ theme: ThemeEnum })
export type ThemeDto = z.infer<typeof ThemeSchema>

export const StaffSessionSchema = z.object({
  staffId: z.string().uuid(),
  username: z.string(),
  role: StaffRoleEnum,
  theme: ThemeEnum,
})
export type StaffSession = z.infer<typeof StaffSessionSchema>

export const OkSchema = z.object({ ok: z.literal(true) })
export type Ok = z.infer<typeof OkSchema>

export const TicketsQuerySchema = z.object({
  status: z.enum(['open', 'paid', 'all']).optional().default('open'),
  station: z.enum(['kitchen', 'bar']).optional(),
})
export type TicketsQuery = z.infer<typeof TicketsQuerySchema>

export const TicketSummarySchema = z.object({
  ticketKey: z.string(),
  tableNo: z.number().int(),
  status: z.enum(['open', 'paid']),
  totalCents: z.number().int(),
  unpaidCents: z.number().int(),
  oldestItemAt: z.string().datetime(),
  lockedBy: z.string().uuid().nullable(),
  // Finished at kitchen/bar but not yet brought to the table (quantities).
  ready: z.object({ kitchen: z.number().int(), bar: z.number().int() }),
  // When the table last ordered (guest QR or waiter) and when a waiter last
  // asked there without an order; drives "Last order X min ago".
  lastOrderAt: z.string().datetime(),
  lastCheckAt: z.string().datetime().nullable(),
  // Table: the responsible waiter ("My table"); walk-in: who took it.
  assignee: AssigneeSchema.nullable(),
})
export type TicketSummary = z.infer<typeof TicketSummarySchema>

export const TicketsListSchema = z.object({
  tickets: z.array(TicketSummarySchema),
  // Every held table, including those with nothing ordered yet (table grid).
  assignments: z.array(TableAssignmentSchema),
  tableRange: z.object({ from: z.number().int(), to: z.number().int() }),
  // Server clock, so the minutes do not depend on the device clock.
  serverNow: z.string().datetime(),
})
export type TicketsList = z.infer<typeof TicketsListSchema>

export const TicketDetailItemSchema = z.object({
  orderItemId: z.string().uuid(),
  orderId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  nameDe: z.string(),
  nameEn: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  depositCents: z.number().int(),
  note: z.string().nullable(),
  station: z.enum(['kitchen', 'bar']),
  productionStatus: z.enum(['pending', 'in_progress', 'done', 'cancelled']),
  paymentStatus: z.enum(['unpaid', 'paid']),
  served: z.boolean(),
  createdAt: z.string().datetime(),
})
export type TicketDetailItem = z.infer<typeof TicketDetailItemSchema>

export const TicketDetailSchema = z.object({
  ticketKey: z.string(),
  tableNo: z.number().int(),
  status: z.enum(['open', 'paid']),
  totalCents: z.number().int(),
  unpaidCents: z.number().int(),
  items: z.array(TicketDetailItemSchema),
  lockedBy: z.string().uuid().nullable(),
  lockExpiresAt: z.string().datetime().nullable(),
  lastOrderAt: z.string().datetime(),
  lastCheckAt: z.string().datetime().nullable(),
  assignee: AssigneeSchema.nullable(),
  serverNow: z.string().datetime(),
})
export type TicketDetail = z.infer<typeof TicketDetailSchema>

export const TableCheckResponseSchema = z.object({
  ticketKey: z.string(),
  checkedAt: z.string().datetime(),
})
export type TableCheckResponse = z.infer<typeof TableCheckResponseSchema>

export const CreatePaymentSchema = z.object({
  ticketKey: z.string().min(2),
  orderItemIds: z.array(z.string().uuid()).min(1),
  // Optional per item: pay only part of a line ("2 of 5 beers"). Missing = all.
  quantities: z.record(z.string().uuid(), z.number().int().min(1)).optional(),
})
export type CreatePayment = z.infer<typeof CreatePaymentSchema>

// Printable receipt (no tax receipt): see server/lib/receipt.ts.
export const ReceiptSchema = z.object({
  paymentId: z.string().uuid(),
  eventName: z.string(),
  tableNo: z.number().int().nullable(), // null = counter sale
  lines: z.array(z.object({
    nameDe: z.string(),
    nameEn: z.string(),
    quantity: z.number().int(),
    unitPriceCents: z.number().int(),
    depositCents: z.number().int(),
    note: z.string().nullable(),
  })),
  totalCents: z.number().int(),
  depositCents: z.number().int(),
  paidAt: z.string().datetime(),
  staffUsername: z.string(),
})
export type Receipt = z.infer<typeof ReceiptSchema>

export const PaymentResponseSchema = z.object({
  paymentId: z.string().uuid(),
  totalCents: z.number().int(),
  ticketStatusAfter: z.enum(['open', 'paid']),
  receipt: ReceiptSchema,
})
export type PaymentResponse = z.infer<typeof PaymentResponseSchema>

export const PaymentLockConflictSchema = z.object({
  code: z.literal('LOCK_CONFLICT'),
  message: z.string(),
  lockedBy: z.string().uuid(),
  lockedByUsername: z.string().optional(),
  expiresAt: z.string().datetime(),
})
export type PaymentLockConflict = z.infer<typeof PaymentLockConflictSchema>

// The order item comes from the path: POST /api/order-items/{id}/void.
export const VoidItemSchema = z.object({
  reason: z.string().min(3).max(200),
})
export type VoidItem = z.infer<typeof VoidItemSchema>

// Own password (admins): confirmed with the current one. Same length rule as
// the admin staff form.
export const ChangePasswordSchema = z.object({
  current: z.string().min(4).max(200),
  next: z.string().min(12).max(200),
})
export type ChangePassword = z.infer<typeof ChangePasswordSchema>
