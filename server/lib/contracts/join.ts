import { z } from 'zod'
import { StaffRoleEnum } from './staff'

// A helper's name as typed on the join page: letters (umlauts too), digits,
// spaces, dot, dash, underscore. Unique per event, ignoring case.
export const JoinNameSchema = z.string().trim().regex(/^[\p{L}\p{N} ._-]{2,30}$/u, 'name: 2-30 letters or digits')

export const JoinRequestSchema = z.object({
  code: z.string().min(1).max(32),
  name: JoinNameSchema,
})
export type JoinRequest = z.infer<typeof JoinRequestSchema>

// What the waiting device sees. `role` comes with "approved".
export const JoinStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  name: z.string(),
  role: StaffRoleEnum.optional(),
})
export type JoinStatus = z.infer<typeof JoinStatusSchema>

// Admins never join by link.
export const JoinRoleEnum = z.enum(['waiter', 'lead', 'kitchen', 'bar'])

export const JoinDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  role: JoinRoleEnum.default('waiter'),
})
export type JoinDecision = z.infer<typeof JoinDecisionSchema>

export const JoinOverviewSchema = z.object({
  code: z.string().nullable(),
  // Absolute link for the QR code / sharing, same base as the table QR codes
  // (lib/public-url.ts).
  url: z.string().url().nullable(),
  pending: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    // Someone with this name already works at the event: approving signs
    // that account in on the new device.
    rejoin: z.boolean(),
    role: JoinRoleEnum.nullable(),
    createdAt: z.string().datetime(),
  })),
  members: z.array(z.object({
    id: z.string().uuid(),
    username: z.string(),
    role: JoinRoleEnum,
    isActive: z.boolean(),
  })),
})
export type JoinOverview = z.infer<typeof JoinOverviewSchema>
