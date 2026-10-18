import { z } from 'zod'

// Pfand handed back: count of returned glasses/mugs at one deposit value.
export const CreateDepositReturnSchema = z.object({
  unitCents: z.number().int().min(1).max(10000),
  quantity: z.number().int().min(1).max(200),
})
export type CreateDepositReturn = z.infer<typeof CreateDepositReturnSchema>

export const DepositReturnSchema = z.object({
  id: z.string().uuid(),
  unitCents: z.number().int(),
  quantity: z.number().int(),
  // Negative: cash going out of the drawer.
  amountCents: z.number().int().max(-1),
  createdAt: z.string().datetime(),
})
export type DepositReturnDto = z.infer<typeof DepositReturnSchema>

// Deposit balance per deposit value: issued with paid items vs. handed back.
export const DepositReportRowSchema = z.object({
  unitCents: z.number().int(),
  issuedQuantity: z.number().int(),
  issuedCents: z.number().int(),
  returnedQuantity: z.number().int(),
  returnedCents: z.number().int(), // negative
  // Still out with guests (issued + returned).
  balanceCents: z.number().int(),
})
export type DepositReportRow = z.infer<typeof DepositReportRowSchema>
