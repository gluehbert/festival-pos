import { z } from 'zod'

// Who looks after a table ("My table"); for a walk-in, who took it.
export const AssigneeSchema = z.object({
  staffId: z.string().uuid(),
  username: z.string(),
})
export type Assignee = z.infer<typeof AssigneeSchema>

export const TableAssignmentSchema = z.object({
  tableNo: z.number().int(),
  staffId: z.string().uuid(),
  username: z.string(),
  assignedAt: z.string().datetime(),
})
export type TableAssignment = z.infer<typeof TableAssignmentSchema>

// Taking a table someone else holds needs `takeOver: true` (after the
// waiter confirmed it); without it the request fails with 409. A shift lead
// names who gets the table (`staffId`) and needs no confirmation.
export const AssignTableSchema = z.object({
  takeOver: z.boolean().optional().default(false),
  staffId: z.string().uuid().optional(),
})
export type AssignTable = z.infer<typeof AssignTableSchema>

export const AssignTableResponseSchema = z.object({
  tableNo: z.number().int(),
  assignee: AssigneeSchema.nullable(),
})
export type AssignTableResponse = z.infer<typeof AssignTableResponseSchema>

// Who a shift lead can hand tables to.
export const TeamSchema = z.object({ team: z.array(AssigneeSchema) })
export type Team = z.infer<typeof TeamSchema>
