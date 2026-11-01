import { z } from 'zod'
import { AssigneeSchema } from './tables'

// 'pay' only on older calls: guests pay when served, so they cannot pick it.
export const CallReasonEnum = z.enum(['pay', 'order', 'question'])
export type CallReason = z.infer<typeof CallReasonEnum>

// Guest: POST /api/waiter-calls
export const CreateWaiterCallSchema = z.object({ reason: z.enum(['order', 'question']) })

// Guest: the table's current call. waiting = nobody answered yet; coming =
// someone is on the way; paused = the service was at the table, which cannot
// call again for a while. null = nothing going on.
export const TableCallStatusEnum = z.enum(['waiting', 'coming', 'paused'])
export const TableCallSchema = z.object({
  reason: CallReasonEnum,
  createdAt: z.string().datetime(),
  status: TableCallStatusEnum,
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
