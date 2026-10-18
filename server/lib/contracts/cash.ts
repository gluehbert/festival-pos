import { z } from 'zod'

// Euro amounts in cents; a drawer rarely holds more than a few thousand euros.
const Cents = z.number().int().min(0).max(10_000_000)

export const OpenCashSessionSchema = z.object({ openingCents: Cents })
export type OpenCashSession = z.infer<typeof OpenCashSessionSchema>

export const CloseCashSessionSchema = z.object({
  countedCents: Cents,
  note: z.string().trim().max(200).optional(),
})
export type CloseCashSession = z.infer<typeof CloseCashSessionSchema>

// Expected cash (Soll) = opening float + collected + tips − refunded + deposit
// returns (booked negative). Test-mode bookings never count.
export const CashSessionSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  username: z.string(),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  openingCents: z.number().int(),
  collectedCents: z.number().int(),
  tipCents: z.number().int().min(0),
  refundedCents: z.number().int(),
  depositReturnedCents: z.number().int().max(0),
  expectedCents: z.number().int(),
  countedCents: z.number().int().nullable(),
  // counted − expected: negative = cash missing.
  differenceCents: z.number().int().nullable(),
  note: z.string().nullable(),
})
export type CashSessionDto = z.infer<typeof CashSessionSchema>

export const CurrentCashSessionSchema = z.object({
  session: CashSessionSchema.nullable(),
  // Set when the open drawer belongs to an event that has ended.
  otherEventName: z.string().nullable(),
})
export type CurrentCashSession = z.infer<typeof CurrentCashSessionSchema>
