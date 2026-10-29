import { z } from 'zod'
import { AssigneeSchema } from './tables'

export const CallReasonEnum = z.enum(['pay', 'order', 'question'])
export type CallReason = z.infer<typeof CallReasonEnum>

// Guest: POST /api/waiter-calls
export const CreateWaiterCallSchema = z.object({ reason: CallReasonEnum })

// Guest: the table's current call, also while "someone is coming" is still
// shown after it was acknowledged. null = nothing going on.
export const TableCallSchema = z.object({
  reason: CallReasonEnum,
  createdAt: z.string().datetime(),
  acknowledged: z.boolean(),
}).nullable()
export type TableCall = z.infer<typeof TableCallSchema>

// Staff: GET /api/waiter-calls, the open calls of the active event.
export const OpenCallSchema = z.object({
  id: z.string().uuid(),
  tableNo: z.number().int(),
  reason: CallReasonEnum,
  waitingSeconds: z.number().int().nonnegative(),
  // Who holds the table; null when nobody does.
  assignee: AssigneeSchema.nullable(),
  // Nobody holds the table, or nobody answered in time: every waiter sees it.
  escalated: z.boolean(),
})
export type OpenCall = z.infer<typeof OpenCallSchema>

export const OpenCallsSchema = z.object({ calls: z.array(OpenCallSchema) })
export type OpenCalls = z.infer<typeof OpenCallsSchema>
